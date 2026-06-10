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
import { listFullGls, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
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

/** Starting (opening) Cash for each requested property for cash-sheet (year,
 *  month). Reads the GL list ONCE (not once per property) and merges each
 *  property's uploads, so the cash sheet loads quickly and reflects every
 *  uploaded month. */
export async function startingCashFor(
  codes: string[],
  year: number,
  month: number,
): Promise<Record<string, StartingCash>> {
  const sourceYm = monthKey(year, month);
  const all = await listFullGls();
  const byKey = new Map<string, StoredGl[]>();
  for (const g of all) {
    if (g.year !== year) continue;
    const list = byKey.get(g.key);
    if (list) list.push(g); else byKey.set(g.key, [g]);
  }
  const out: Record<string, StartingCash> = {};
  for (const code of codes) {
    const stored = assembleGls(byKey.get(code) ?? []);
    out[code] = { amount: stored ? cashAtStartOfMonth(stored, month) : null, sourceYm };
  }
  return out;
}
