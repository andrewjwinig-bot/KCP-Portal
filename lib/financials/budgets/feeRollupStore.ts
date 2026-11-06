// 2010's management-fee revenue is the sum of every fee-paying building's
// budgeted fee — which takes every building's whole draft to know. Built on
// each open of 2010's draft it took minutes (owner: "taking a very very very
// very long time to load"). So the buildings' fees are KEPT, one row per
// building per budget year: a building's own draft writes its row each time
// it is built (opening it, or a book's roll-up building it), and 2010 reads
// the rows instead of rebuilding every building. Only a year with no rows yet
// is built in full, once.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { FeeRollupRow } from "./draft";

const PREFIX = "budget-fee-rollup";
type Doc = { rows: Record<string, FeeRollupRow & { at: string }> };

export async function getFeeRollup(budgetYear: number): Promise<FeeRollupRow[] | null> {
  const doc = (await getJSON(PREFIX, String(budgetYear))) as Doc | null;
  if (!doc?.rows || !Object.keys(doc.rows).length) return null;
  return Object.values(doc.rows).filter((r) => r.total).sort((a, b) => b.total - a.total);
}

export async function saveFeeRollup(budgetYear: number, rows: FeeRollupRow[]): Promise<void> {
  const at = new Date().toISOString();
  const doc: Doc = { rows: {} };
  for (const r of rows) doc.rows[r.code.toUpperCase()] = { ...r, at };
  await storeJSON(PREFIX, String(budgetYear), doc);
}

/** One building's fee, written when its draft is built. A $0 fee is kept as
 *  a row too, so a building whose fee went to nothing stops counting. */
export async function upsertFeeRow(budgetYear: number, row: FeeRollupRow): Promise<void> {
  const doc = ((await getJSON(PREFIX, String(budgetYear))) as Doc | null) ?? { rows: {} };
  doc.rows = { ...(doc.rows ?? {}), [row.code.toUpperCase()]: { ...row, at: new Date().toISOString() } };
  await storeJSON(PREFIX, String(budgetYear), doc);
}
