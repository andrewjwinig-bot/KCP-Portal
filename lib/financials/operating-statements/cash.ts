// Operating Cash (0110-0000) — the single source of truth for the month's cash
// position, shared by the Operating Statement "Starting Cash" KPI and the Cash
// Sheet's starting cash, so the two never disagree.
//
// 0110-0000 is a balance-sheet account: the GL carries its year-opening
// (Beginning Balance) plus a net cash change per month. The balance at the
// START of any month = the opening + the net activity of every PRIOR month, so
// a multi-month GL (e.g. Mar–May) yields a distinct, accurate balance for each
// month rather than one static year-end figure. Pure, so it's unit-tested.

export const CASH_ACCT = "0110-0000";

export type CashGl = {
  /** account → Beginning Balance (opens at coverageStartMonth, or Jan). */
  beginning?: Record<string, number>;
  /** account → 12 monthly nets (Jan–Dec). */
  monthly: Record<string, number[]>;
  /** Last (contiguous) month present in the file. */
  maxPeriodInFile: number;
  /** Last month of the report range (the "To" date); the cash nets are filled
   *  through here even for quiet months. Falls back to maxPeriodInFile. */
  coverageEnd?: number;
  /** First month (1–12) the data covers — the month the opening balance applies
   *  to. A partial-year import (e.g. Mar–May) has no valid opening before it. */
  coverageStartMonth?: number;
};

/**
 * Opening (start-of-month) Operating Cash for `month` (1–12): the opening
 * balance plus net cash activity for every PRIOR covered month. Returns null
 * when the GL has no captured opening, when `month` is before the data starts
 * (a partial-year import has no opening for earlier months), or when the prior
 * months aren't loaded yet — so the caller shows nothing rather than a wrong
 * number.
 */
export function cashAtStartOfMonth(gl: CashGl, month: number): number | null {
  const begin = gl.beginning?.[CASH_ACCT];
  if (begin == null) return null;
  const openMonth = gl.coverageStartMonth ?? 1; // the month `begin` opens at
  if (month < openMonth) return null; // before the data starts — no valid opening
  const priorMonths = month - 1; // net activity for Jan..(month-1); pre-coverage months are 0
  if (priorMonths <= 0) return begin; // start of the opening month = the opening balance
  // Bound by the report coverage (the "To" date), not the last *active* month —
  // a quiet month still has a (zero) net and a valid running balance.
  const coverage = gl.coverageEnd ?? gl.maxPeriodInFile;
  if (priorMonths > coverage) return null; // those months aren't in the file yet
  const nets = gl.monthly[CASH_ACCT];
  if (!nets) return null;
  return begin + nets.slice(0, priorMonths).reduce((a, n) => a + (n || 0), 0);
}
