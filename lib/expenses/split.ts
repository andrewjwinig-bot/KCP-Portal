// How a coded credit-card charge lands on properties — ONE rule for the
// Expense Coder (which bills) and Expense History (which rebuilds a sent
// month's invoices). Overhead codes BP / SC / "BP & SC" explode by ALLOC_PCT
// (9301 / 9302 / 9303); a fund code (PJV3 / PNIPLX) across its buildings by
// square footage. Cents are kept whole: largest remainders take the extra cent.

import { ALLOC_PCT, FUND_SF_ALLOC } from "@/lib/properties/data";

const pick = (col: "9301" | "9302" | "9303") =>
  Object.fromEntries(Object.entries(ALLOC_PCT).filter(([, v]) => v[col] > 0).map(([id, v]) => [id, v[col]]));
export const ALLOC_BP: Record<string, number> = pick("9301");
export const ALLOC_SC: Record<string, number> = pick("9302");
export const ALLOC_BP_SC: Record<string, number> = Object.fromEntries(Object.entries(ALLOC_PCT).map(([id, v]) => [id, v["9303"]]));

const cents = (n: number) => Math.round((Number(n) || 0) * 100);

export function allocateCentsByPercents(totalCents: number, entries: Array<{ key: string; pct: number }>) {
  const nonZero = entries.filter((e) => e.pct > 0);
  if (!nonZero.length) return [] as Array<{ key: string; cents: number }>;
  const exact = nonZero.map((e) => ({ key: e.key, exact: totalCents * e.pct }));
  const floors = exact.map((e) => ({ key: e.key, cents: Math.floor(e.exact), frac: e.exact - Math.floor(e.exact) }));
  const used = floors.reduce((a, e) => a + e.cents, 0);
  let rem = totalCents - used;
  floors.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < floors.length && rem > 0; i++) { floors[i].cents += 1; rem -= 1; }
  return floors.map((e) => ({ key: e.key, cents: e.cents }));
}

export function expandForAllocation<T extends { propertyId: string; amount: number }>(t: T): Array<T & { originalAmount?: number }> {
  const allocTable =
    t.propertyId === "BP & SC" ? ALLOC_BP_SC :
    t.propertyId === "BP"      ? ALLOC_BP :
    t.propertyId === "SC"      ? ALLOC_SC :
    FUND_SF_ALLOC[t.propertyId] ?? null;
  if (!allocTable) return [t];
  const alloc = allocateCentsByPercents(cents(t.amount), Object.entries(allocTable).map(([key, pct]) => ({ key, pct })));
  if (!alloc.length) return [t];
  return alloc.filter((a) => a.cents !== 0).map((a) => ({ ...t, propertyId: a.key, amount: a.cents / 100, originalAmount: t.amount }));
}
