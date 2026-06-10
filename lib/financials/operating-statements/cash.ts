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
  /** account → Beginning Balance (year opening). */
  beginning?: Record<string, number>;
  /** account → 12 monthly nets (Jan–Dec). */
  monthly: Record<string, number[]>;
  /** Last (contiguous) month present in the file. */
  maxPeriodInFile: number;
};

/**
 * Opening (start-of-month) Operating Cash for `month` (1–12): the year's
 * opening balance plus net cash activity for every PRIOR month. Returns null
 * when the GL has no captured opening balance, or doesn't yet cover the prior
 * months needed (so the caller shows nothing rather than a wrong number).
 */
export function cashAtStartOfMonth(gl: CashGl, month: number): number | null {
  const begin = gl.beginning?.[CASH_ACCT];
  if (begin == null) return null;
  const priorMonths = month - 1; // net activity for Jan..(month-1)
  if (priorMonths <= 0) return begin; // start of January = the year's opening
  if (priorMonths > gl.maxPeriodInFile) return null; // those months aren't in the file yet
  const nets = gl.monthly[CASH_ACCT];
  if (!nets) return null;
  return begin + nets.slice(0, priorMonths).reduce((a, n) => a + (n || 0), 0);
}
