// The payroll totals entered for a book (`payrollPools.ts`) — one document per
// (budget year, book), keyed by block (`gl|label`).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { PoolEntries } from "./payrollPools";

const PREFIX = "budget-payroll-pools";
const idFor = (budgetYear: number, bookId: string) => `${budgetYear}-${bookId}`;

export async function getPoolEntries(budgetYear: number, bookId: string): Promise<PoolEntries> {
  return ((await getJSON(PREFIX, idFor(budgetYear, bookId))) as PoolEntries | null) ?? {};
}

/** Set a block's total; null hands it back to last year +3%. */
export async function setPoolEntry(budgetYear: number, bookId: string, key: string, annual: number | null, by: string): Promise<PoolEntries> {
  const doc = { ...(await getPoolEntries(budgetYear, bookId)) };
  if (annual == null) delete doc[key];
  else doc[key] = { annual: Math.round(annual), by, at: new Date().toISOString() };
  await storeJSON(PREFIX, idFor(budgetYear, bookId), doc);
  return doc;
}
