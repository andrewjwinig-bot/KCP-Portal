/** Period key for bank reconciliations — YYYY-MM. */
export function bankRecPeriod(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Display label for a period, e.g. "May 2026". */
export function bankRecPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[m - 1]} ${y}`;
}

/** Shift a YYYY-MM period by N months (positive or negative). */
export function shiftPeriod(period: string, deltaMonths: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return bankRecPeriod(d);
}

/** Storage key for a single account's reconciled state in a given period. */
export function bankRecKey(last4: string, period: string): string {
  return `${last4}|${period}`;
}

/** The day-of-month bank recs are due (the prior month's recs are due by the 10th of the next month). */
export const BANK_REC_DUE_DAY = 10;

/**
 * Returns the next bank-rec deadline relative to `now`:
 *  - If today is before the 10th of this month → due 10th of this month (recs for prior month)
 *  - Otherwise → due 10th of next month (recs for this month)
 * Also returns the period being reconciled by that deadline.
 */
export function nextBankRecDeadline(now: Date = new Date()): { date: Date; period: string; daysUntil: number } {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonthDeadline = new Date(t.getFullYear(), t.getMonth(), BANK_REC_DUE_DAY);
  let deadline: Date;
  let periodDate: Date;
  if (t.getTime() <= thisMonthDeadline.getTime()) {
    deadline = thisMonthDeadline;
    periodDate = new Date(t.getFullYear(), t.getMonth() - 1, 1); // prior month
  } else {
    deadline = new Date(t.getFullYear(), t.getMonth() + 1, BANK_REC_DUE_DAY);
    periodDate = new Date(t.getFullYear(), t.getMonth(), 1); // this month
  }
  const daysUntil = Math.round((deadline.getTime() - t.getTime()) / 86400000);
  return { date: deadline, period: bankRecPeriod(periodDate), daysUntil };
}
