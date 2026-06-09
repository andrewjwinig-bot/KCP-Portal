// Cash Sheet — Starting Cash sourcing.
//
// Starting Cash for a month = that month's OPENING Operating Cash balance — the
// balance of the Cash-Operating account (0110-0000) at the first of the month,
// read from the property's uploaded Operating Statement GL. This is the same
// figure the statement's "Starting Cash (Per GL)" KPI shows for the month.
// Computed as the year's opening (Beginning Balance) plus net cash activity for
// every month BEFORE the cash-sheet month. As statements get uploaded month
// over month it updates automatically.

import "server-only";
import { latestGl, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { monthKey } from "./util";

const CASH_ACCT = "0110-0000";

/** Operating Cash balance at the START of `month` (1–12): the year's opening
 *  balance + net cash activity for every prior month. Null when the GL doesn't
 *  yet cover the months needed. */
function cashAtStartOfMonth(stored: StoredGl, month: number): number | null {
  const begin = stored.beginning?.[CASH_ACCT];
  if (begin == null) return null;
  const priorMonths = month - 1; // activity for Jan..(month-1)
  if (priorMonths === 0) return begin; // start of January = the year's opening balance
  if (priorMonths > stored.maxPeriodInFile) return null; // those months aren't in the file yet
  const nets = stored.monthly[CASH_ACCT];
  if (!nets) return null;
  return begin + nets.slice(0, priorMonths).reduce((a, n) => a + (n || 0), 0);
}

export type StartingCash = {
  /** Start-of-month Operating Cash, or null if the statement isn't available. */
  amount: number | null;
  /** The cash-sheet month this is the opening balance for ("YYYY-MM"). */
  sourceYm: string;
};

/** Starting (opening) Cash for each requested property for cash-sheet (year, month). */
export async function startingCashFor(
  codes: string[],
  year: number,
  month: number,
): Promise<Record<string, StartingCash>> {
  const sourceYm = monthKey(year, month);
  const entries = await Promise.all(
    codes.map(async (code) => {
      const stored = await latestGl(code, year);
      const amount = stored ? cashAtStartOfMonth(stored, month) : null;
      return [code, { amount, sourceYm }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
