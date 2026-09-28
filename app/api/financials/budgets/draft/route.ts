import { NextResponse } from "next/server";
import { buildBudgetDraft } from "@/lib/financials/budgets/draft";
import { consolidateDrafts } from "@/lib/financials/budgets/consolidate";
import { bookById } from "@/lib/financials/budgets/books";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canEditLines, lineEditScope, canSeePayroll } from "@/lib/financials/budgets/contributors";
import type { BudgetDraft as Draft } from "@/lib/financials/budgets/draft";

/** Strip the payroll book's totals and shares off every line for a viewer who
 *  may not see payroll (`canSeePayroll`) — the line keeps only its own figure. */
function withoutPayroll(d: Draft): Draft {
  return { ...d, sections: d.sections.map((s) => ({ ...s, lines: s.lines.map((l) => (l.pool ? { ...l, pool: undefined } : l)) })) };
}
import { getLineNotes } from "@/lib/financials/budgets/lineNoteStore";
import { buildBookDrafts } from "@/lib/financials/budgets/bookDrafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// 2010's draft builds every building's draft to total their management fees.
export const maxDuration = 300;

// GET /api/financials/budgets/draft
//   (no key)                 → the list of buildings/funds a draft can be built for
//   ?key=<key>&year=&growth= → the auto-seeded draft for that property/fund
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const bookId = url.searchParams.get("book");
  const now = new Date();

  // A BOOK's roll-up — "All Shopping Centers" — is the sum of its properties'
  // drafts (consolidate.ts), four built at a time. Read-only.
  if (bookId) {
    const book = bookById(bookId);
    if (!book || !book.rollsUp) return NextResponse.json({ error: "No roll-up for that book." }, { status: 404 });
    const year = Number(url.searchParams.get("year")) || now.getFullYear() + 1;
    const growth = Number(url.searchParams.get("growth"));
    const drafts = await buildBookDrafts(book, year, Number.isFinite(growth) ? growth : 3);
    const all = consolidateDrafts(`All ${book.name}`, drafts);
    if (!all) return NextResponse.json({ missingBasis: true, key: `book:${bookId}`, year, basisYear: year - 1 }, { status: 200 });
    return NextResponse.json({ ...all, notes: {}, canEditLines: false, lineEditScope: null });
  }

  if (!key) {
    const list = await availableStatements();
    return NextResponse.json({ properties: list });
  }

  const year = Number(url.searchParams.get("year")) || now.getFullYear() + 1;
  const growth = Number(url.searchParams.get("growth"));
  const growthPct = Number.isFinite(growth) ? growth : 3;

  const draft = await buildBudgetDraft(key, year, growthPct);
  if (!draft) {
    return NextResponse.json({ missingBasis: true, key, year, basisYear: year - 1, growthPct }, { status: 200 });
  }
  // Whether this viewer may type months into the grid — the save route checks
  // it again; this only decides whether the cells open for typing.
  // The notes left on its lines ride with it, keyed `section::label`.
  const notes = await getLineNotes(draft.budgetYear, draft.propertyCode).catch(() => ({}));
  const user = await budgetUser();
  const shown = canSeePayroll(user) ? draft : withoutPayroll(draft);
  return NextResponse.json({ ...shown, notes, canEditLines: canEditLines(user), lineEditScope: lineEditScope(user) });
}
