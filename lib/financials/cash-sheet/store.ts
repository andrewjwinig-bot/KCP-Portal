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
import { type CashSheetRow, monthKey } from "./util";

const PREFIX = "financials-cash-sheet";

export type CashSheetMonth = {
  ym: string;
  year: number;
  month: number;
  rows: Record<string, CashSheetRow>;
  updatedAt: string;
  updatedBy?: string;
  /** Last AP Selection Report import (set only by applyBills). */
  apImportedAt?: string;
  apImportedBy?: string;
};

export async function getMonth(ym: string): Promise<CashSheetMonth | null> {
  return (await getJSON(PREFIX, ym)) as CashSheetMonth | null;
}

/** Every saved month key, newest first. */
export async function listMonths(): Promise<string[]> {
  const all = (await listJSON(PREFIX)) as CashSheetMonth[];
  return all.map((m) => m.ym).sort((a, b) => (a < b ? 1 : -1));
}

function emptyRow(): CashSheetRow {
  return { bills: {} };
}

/**
 * Apply a single-cell edit to a month, creating the doc on first write.
 * Reserves are auto-derived from the budget (see reserves.ts); a saved reserves
 * value is a per-month OVERRIDE (null clears it).
 */
export async function applyEdit(params: {
  year: number;
  month: number;
  code: string;
  kind: "reserves" | "bill" | "startingOverride" | "endingOverride";
  wednesday?: string;
  /** The new value, or null to clear an override. */
  value: number | null;
  updatedBy?: string;
}): Promise<CashSheetMonth> {
  const { year, month, code, kind, wednesday, value, updatedBy } = params;
  const ym = monthKey(year, month);
  let doc = await getMonth(ym);
  if (!doc) {
    doc = { ym, year, month, rows: {}, updatedAt: new Date().toISOString(), updatedBy };
  }
  const row = doc.rows[code] ?? emptyRow();
  if (kind === "reserves") {
    if (value == null) delete row.reserves;
    else row.reserves = value;
  } else if (kind === "bill" && wednesday) {
    if (value) row.bills[wednesday] = value;
    else delete row.bills[wednesday];
  } else if (kind === "startingOverride") {
    if (value == null) delete row.startingOverride;
    else row.startingOverride = value;
  } else if (kind === "endingOverride") {
    if (value == null) delete row.endingOverride;
    else row.endingOverride = value;
  }
  doc.rows[code] = row;
  doc.updatedAt = new Date().toISOString();
  if (updatedBy) doc.updatedBy = updatedBy;
  await storeJSON(PREFIX, ym, doc);
  return doc;
}

/**
 * Set the `wednesday` bill for many codes in ONE read-modify-write — used by the
 * AP report upload so all properties save atomically (a per-code loop would be
 * 15+ blob writes and could fail partway, leaving only some filled).
 */
export async function applyBills(
  year: number,
  month: number,
  wednesday: string,
  byCode: Record<string, number>,
  updatedBy?: string,
): Promise<CashSheetMonth> {
  const ym = monthKey(year, month);
  const doc = (await getMonth(ym)) ?? { ym, year, month, rows: {}, updatedAt: new Date().toISOString(), updatedBy };
  for (const [code, value] of Object.entries(byCode)) {
    const row = doc.rows[code] ?? emptyRow();
    if (value) row.bills[wednesday] = value; else delete row.bills[wednesday];
    doc.rows[code] = row;
  }
  const now = new Date().toISOString();
  doc.updatedAt = now;
  doc.apImportedAt = now; // bulk bill fill = an AP Selection Report import
  if (updatedBy) { doc.updatedBy = updatedBy; doc.apImportedBy = updatedBy; }
  await storeJSON(PREFIX, ym, doc);
  return doc;
}
