// WHICH BUDGET IS IN FORCE. A budget governs its own calendar year: the 2027
// budget can be published in October 2026 and still must not be what anything
// compares against until January 1st. Most readers already ask for a specific
// year (a July 2026 statement asks for 2026); these helpers are for the ones
// that used to take "the newest year on file", which a published 2027 would
// otherwise have hijacked the moment it landed.

import type { BudgetWorkbook } from "./types";

/** The year whose budget governs `now` — the calendar year. */
export const yearInForce = (now: Date = new Date()) => now.getFullYear();

/**
 * From the years that have a budget, the one to use for `year`: that year if
 * there is one; else the latest BEFORE it (a budget carries forward until the
 * next is in force); else the earliest after it. Null when there are none.
 */
export function pickBudgetYear(years: number[], year: number = yearInForce()): number | null {
  const ys = [...new Set(years.filter((y) => Number.isFinite(y)))];
  if (!ys.length) return null;
  if (ys.includes(year)) return year;
  const before = ys.filter((y) => y < year);
  if (before.length) return Math.max(...before);
  return Math.min(...ys);
}

/** Several workbooks can carry one property for one year (a staff workbook and
 *  a published draft; a live budget built beside them). Only ONE may count, or
 *  every figure is doubled: published first, then final, then the newest. */
export function workbookRank(w: Pick<BudgetWorkbook, "kind" | "status" | "uploadedAt">): number {
  const kind = w.kind === "published" ? 0 : 1;
  const status = w.status === "draft" ? 1 : 0;
  return kind * 2 + status;
}

export function preferredWorkbooks<W extends Pick<BudgetWorkbook, "kind" | "status" | "uploadedAt">>(wbs: W[]): W[] {
  return [...wbs].sort((a, b) => workbookRank(a) - workbookRank(b) || String(b.uploadedAt ?? "").localeCompare(String(a.uploadedAt ?? "")));
}
