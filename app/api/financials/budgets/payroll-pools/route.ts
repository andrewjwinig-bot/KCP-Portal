import { NextResponse } from "next/server";
import { bookById } from "@/lib/financials/budgets/books";
import { payrollBlocks, poolAnnual, allocatePool } from "@/lib/financials/budgets/payrollPools";
import { getPoolEntries, setPoolEntry } from "@/lib/financials/budgets/payrollPoolStore";
import { priorBudgetProperties } from "@/lib/financials/budgets/draft";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canEditLines } from "@/lib/financials/budgets/contributors";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The payroll totals a book allocates across its properties
// (`lib/financials/budgets/payrollPools.ts`).
// GET ?year=&book= → each block: last year's total, this year's (entered or
// +3%), and every property's share and amount.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear() + 1;
  const book = bookById(url.searchParams.get("book") ?? "");
  if (!book) return NextResponse.json({ error: "Unknown book." }, { status: 400 });
  const [prior, entries, user] = await Promise.all([
    priorBudgetProperties(book.properties, year - 1),
    getPoolEntries(year, book.id).catch(() => ({})),
    budgetUser(),
  ]);
  const blocks = payrollBlocks(prior).map((b) => {
    const e = (entries as Record<string, { annual: number; by?: string; at?: string }>)[b.key];
    const { annual, entered } = poolAnnual(b, e);
    const split = book.properties
      .filter((c) => b.shares[c.toUpperCase()] != null)
      .map((c) => ({ code: c, sharePct: b.shares[c.toUpperCase()], amount: (allocatePool(b, annual, c) ?? []).reduce((a, v) => a + v, 0) }));
    return { ...b, annual, entered, by: e?.by ?? null, at: e?.at ?? null, split };
  });
  return NextResponse.json({ year, basisYear: year - 1, book: book.id, blocks, canEdit: canEditLines(user) });
}

// POST { year, book, key, annual } — annual null hands the block back to last year +3%.
export async function POST(req: Request) {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canEditLines(user)) return NextResponse.json({ error: "Only Drew can set the payroll totals." }, { status: 403 });
  try {
    const b = await req.json();
    const year = Number(b?.year);
    const book = bookById(String(b?.book ?? ""));
    const key = String(b?.key ?? "");
    if (!year || !book || !key) return NextResponse.json({ error: "year, book and key are required" }, { status: 400 });
    const raw = b?.annual;
    const annual = raw === null || raw === "" || raw === undefined ? null : Math.round(Number(raw));
    if (annual != null && (!Number.isFinite(annual) || annual < 0)) return NextResponse.json({ error: "A non-negative total is required." }, { status: 400 });
    await setPoolEntry(year, book.id, key, annual, USERS[user]?.label ?? user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
