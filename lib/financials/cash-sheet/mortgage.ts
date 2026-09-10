// Cash Sheet — Mortgage payments (known outflows from the debt tracker).
//
// Each loan's scheduled monthly P&I payment for the cash-sheet month, taken from
// the debt tracker's amortization schedule (handles interest-only, amendments,
// and amortizing loans). Aggregated to the cash-sheet code that carries the
// cash: shopping-center loans key to their own property; the JV III and NI LLC
// loans key to their fund row.

import "server-only";
import { listLoans } from "@/lib/debt/storage";
import { buildSchedule } from "@/lib/debt/amortization";

// Loans whose `property` is the holding/representative entity rather than a
// cash-sheet code — map them to the fund row that holds the operating cash.
const LOAN_TO_CASHSHEET: Record<string, string> = {
  "3600": "PJV3",   // Lincoln Joint Venture III → JV III fund
  "4000": "PNIPLX", // Neshaminy Interplex, LLC → NI LLC fund
};

/** Scheduled mortgage P&I payment per cash-sheet code (uppercased) for a
 *  (year, month). Empty when no loan pays that month. */
export async function mortgagePaymentsFor(year: number, month: number): Promise<Record<string, number>> {
  const loans = await listLoans();
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const out: Record<string, number> = {};
  for (const loan of loans) {
    if (!loan.property) continue;
    const row = buildSchedule(loan).find((r) => r.date.startsWith(ym));
    if (!row || row.payment <= 0) continue;
    const code = (LOAN_TO_CASHSHEET[loan.property] ?? loan.property).toUpperCase();
    out[code] = (out[code] ?? 0) + Math.round(row.payment);
  }
  return out;
}
