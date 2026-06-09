// Cash Sheet storage — one blob per month, keyed "YYYY-MM".
//
// Each month holds per-property manual inputs (standing reserves + weekly
// bills). Starting Cash is NOT stored here — it's pulled live from the
// Operating Statements at read time (see startingCash.ts). Reserves carry
// month-to-month: when a month is first written we seed each row's reserve
// from the prior month so the standing amount persists until changed; weekly
// bills always start empty (they're entered fresh each month).

import "server-only";
import { storeJSON, listJSON, getJSON } from "@/lib/storage";
import { type CashSheetRow, priorMonth, monthKey } from "./util";

const PREFIX = "financials-cash-sheet";

export type CashSheetMonth = {
  ym: string;
  year: number;
  month: number;
  rows: Record<string, CashSheetRow>;
  updatedAt: string;
  updatedBy?: string;
};

export async function getMonth(ym: string): Promise<CashSheetMonth | null> {
  return (await getJSON(PREFIX, ym)) as CashSheetMonth | null;
}

/** Every saved month key, newest first. */
export async function listMonths(): Promise<string[]> {
  const all = (await listJSON(PREFIX)) as CashSheetMonth[];
  return all.map((m) => m.ym).sort((a, b) => (a < b ? 1 : -1));
}

/** Reserve amounts per property from a month (for carry-forward prefill). */
async function reservesFrom(ym: string): Promise<Record<string, number>> {
  const doc = await getMonth(ym);
  const out: Record<string, number> = {};
  if (doc) for (const [code, row] of Object.entries(doc.rows)) {
    if (row.reserves) out[code] = row.reserves;
  }
  return out;
}

/** Reserve amounts carried into (year, month) from the prior month. */
export async function carriedReserves(year: number, month: number): Promise<Record<string, number>> {
  const prev = priorMonth(year, month);
  return reservesFrom(monthKey(prev.year, prev.month));
}

function emptyRow(): CashSheetRow {
  return { reserves: 0, bills: {} };
}

/**
 * Apply a single-cell edit to a month, creating + seeding the doc on first
 * write (reserves carried from the prior month). Returns the updated doc.
 */
export async function applyEdit(params: {
  year: number;
  month: number;
  code: string;
  kind: "reserves" | "bill";
  wednesday?: string;
  value: number;
  updatedBy?: string;
}): Promise<CashSheetMonth> {
  const { year, month, code, kind, wednesday, value, updatedBy } = params;
  const ym = monthKey(year, month);
  let doc = await getMonth(ym);
  if (!doc) {
    // Seed a fresh month: carry the prior month's reserves into each row.
    const carried = await carriedReserves(year, month);
    const rows: Record<string, CashSheetRow> = {};
    for (const [c, reserves] of Object.entries(carried)) rows[c] = { reserves, bills: {} };
    doc = { ym, year, month, rows, updatedAt: new Date().toISOString(), updatedBy };
  }
  const row = doc.rows[code] ?? emptyRow();
  if (kind === "reserves") {
    row.reserves = value;
  } else if (kind === "bill" && wednesday) {
    if (value) row.bills[wednesday] = value;
    else delete row.bills[wednesday];
  }
  doc.rows[code] = row;
  doc.updatedAt = new Date().toISOString();
  if (updatedBy) doc.updatedBy = updatedBy;
  await storeJSON(PREFIX, ym, doc);
  return doc;
}
