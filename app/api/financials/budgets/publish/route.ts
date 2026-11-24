import { NextResponse } from "next/server";
import { bookById } from "@/lib/financials/budgets/books";
import { buildBookDrafts } from "@/lib/financials/budgets/bookDrafts";
import { consolidateDrafts } from "@/lib/financials/budgets/consolidate";
import { priorBudgetProperties } from "@/lib/financials/budgets/draft";
import { buildPublishedWorkbook, publishedWorkbookId } from "@/lib/financials/budgets/publish";
import { getLineNotes } from "@/lib/financials/budgets/lineNoteStore";
import { listBudgets, getBudget, saveBudget, deleteBudget } from "@/lib/financials/budgets/storage";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isBudgetAuthor } from "@/lib/financials/budgets/contributors";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Publishing builds every property's draft in the book.
export const maxDuration = 300;

// PUBLISH TO BUDGETS (`lib/financials/budgets/publish.ts`).
//   GET    ?book=&year=                 → is it published, by whom, and what it would displace
//   POST   { book, year, replace? }     → write the book's drafts as the year's budget of record
//   DELETE ?book=&year=                 → take it back down
// Publishing a future year changes nothing today: every reader asks for the
// budget of the year it is looking at, so it takes effect on January 1st.

const yearOf = (v: unknown) => {
  const y = Number(v);
  return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
};

/** Other workbooks for the same year carrying any of the book's properties —
 *  what a publish would sit beside (and the readers would have to choose
 *  between), so the owner decides rather than the code. */
async function conflictsFor(bookId: string, year: number, codes: string[]) {
  const set = new Set(codes.map((c) => c.toUpperCase()));
  const id = publishedWorkbookId(bookId, year);
  return (await listBudgets())
    .filter((w) => w.year === year && w.id !== id && w.properties.some((p) => set.has(String(p.propertyCode).toUpperCase())))
    .map((w) => ({ id: w.id, label: w.label, kind: w.kind }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const book = bookById(url.searchParams.get("book") ?? "");
  const year = yearOf(url.searchParams.get("year"));
  if (!book || !year) return NextResponse.json({ error: "book and year are required" }, { status: 400 });
  const [wb, conflicts, user] = await Promise.all([
    getBudget(publishedWorkbookId(book.id, year)),
    conflictsFor(book.id, year, book.properties),
    budgetUser(),
  ]);
  return NextResponse.json({
    published: wb ? {
      id: wb.id, at: wb.uploadedAt, by: wb.uploadedBy ?? null,
      fingerprint: wb.source?.draftFingerprint ?? null,
      unmapped: wb.source?.unmapped ?? [],
      properties: wb.properties.map((p) => p.propertyCode),
    } : null,
    conflicts,
    canPublish: isBudgetAuthor(user),
  });
}

export async function POST(req: Request) {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBudgetAuthor(user)) return NextResponse.json({ error: "Only Drew, Alison or admin can publish a budget." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const book = bookById(String(body?.book ?? ""));
  const year = yearOf(body?.year);
  if (!book || !year || !book.properties.length) return NextResponse.json({ error: "book and year are required" }, { status: 400 });

  // Anything else for the year that carries these properties: the readers
  // would have to pick one, so the owner says which — never silently.
  const conflicts = await conflictsFor(book.id, year, book.properties);
  if (conflicts.length && body?.replace !== true) {
    return NextResponse.json({ error: "Another budget for this year covers these properties.", conflicts }, { status: 409 });
  }

  const drafts = await buildBookDrafts(book, year, 3);
  if (!drafts.length) return NextResponse.json({ error: `No ${year} draft could be built for ${book.name}.` }, { status: 422 });
  // Each property's notes ride along onto its lines.
  await Promise.all(drafts.map(async (d) => { d.notes = await getLineNotes(year, d.propertyCode).catch(() => ({})); }));
  const consolidated = book.rollsUp ? consolidateDrafts(`All ${book.name}`, drafts) : null;
  const prior: Record<string, Awaited<ReturnType<typeof priorBudgetProperties>>[number] | null> = {};
  const priors = await priorBudgetProperties(drafts.map((d) => d.propertyCode), year - 1);
  for (const p of priors) prior[String(p.propertyCode).toUpperCase()] = p;

  const by = USERS[user]?.label ?? user;
  const { workbook, unmapped } = buildPublishedWorkbook({ book, year, drafts, consolidated, prior, by, at: new Date().toISOString() });
  for (const c of conflicts) await deleteBudget(c.id);
  await saveBudget(workbook);
  return NextResponse.json({ ok: true, id: workbook.id, properties: workbook.properties.length, unmapped, replaced: conflicts });
}

export async function DELETE(req: Request) {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBudgetAuthor(user)) return NextResponse.json({ error: "Only Drew, Alison or admin can unpublish a budget." }, { status: 403 });
  const url = new URL(req.url);
  const book = bookById(url.searchParams.get("book") ?? "");
  const year = yearOf(url.searchParams.get("year"));
  if (!book || !year) return NextResponse.json({ error: "book and year are required" }, { status: 400 });
  const ok = await deleteBudget(publishedWorkbookId(book.id, year));
  return NextResponse.json({ ok });
}
