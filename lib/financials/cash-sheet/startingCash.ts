// Cash Sheet — Starting Cash sourcing.
//
// Starting Cash for a month = the prior month's MONTH-END Operating Cash, i.e.
// the ending balance of the Cash-Operating account (0110-0000) through that
// month, read from the property's uploaded Operating Statement GL. (Same
// figure as the "Operating Cash · YTD (Per GL)" KPI on the statement page.)
// As statements get uploaded month over month, the Starting Cash updates
// automatically.

import "server-only";
import { latestGl, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { priorMonth, monthKey } from "./util";

const CASH_ACCT = "0110-0000";

/** Ending balance of Operating Cash through `period` (1–12), or null when the
 *  GL doesn't cover that month. */
function cashAtPeriod(stored: StoredGl, period: number): number | null {
  if (period < 1 || period > stored.maxPeriodInFile) return null;
  // YTD Total row is the authoritative ending balance, but only through the
  // last period in the file.
  if (period === stored.maxPeriodInFile && stored.ytdTotal && stored.ytdTotal[CASH_ACCT] != null) {
    return stored.ytdTotal[CASH_ACCT];
  }
  // Otherwise reconstruct: beginning balance + net activity through `period`.
  const nets = stored.monthly[CASH_ACCT];
  if (stored.beginning && nets) {
    const begin = stored.beginning[CASH_ACCT] ?? 0;
    return begin + nets.slice(0, period).reduce((a, n) => a + (n || 0), 0);
  }
  return null;
}

export type StartingCash = {
  /** Month-end cash, or null if the prior month's statement isn't available. */
  amount: number | null;
  /** The month the figure is sourced from, "YYYY-MM" (always returned so the
   *  UI can label it even when the amount is missing). */
  sourceYm: string;
};

/** Starting Cash for each requested property for cash-sheet (year, month). */
export async function startingCashFor(
  codes: string[],
  year: number,
  month: number,
): Promise<Record<string, StartingCash>> {
  const prev = priorMonth(year, month);
  const sourceYm = monthKey(prev.year, prev.month);
  const entries = await Promise.all(
    codes.map(async (code) => {
      const stored = await latestGl(code, prev.year);
      const amount = stored ? cashAtPeriod(stored, prev.month) : null;
      return [code, { amount, sourceYm }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
