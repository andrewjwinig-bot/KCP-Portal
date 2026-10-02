import { lineMonthly } from "./lineSeries";
import type { PropertyStatement } from "./types";

/**
 * For every line already flagged `fullyFundedYtd` (a $0 month whose full-year
 * budget is booked YTD — a front-loaded expense), record WHICH month the bulk
 * of the cost posted, so the statement can say "paid in March". Picks the month
 * with the largest single posting in the YTD series. Mutates in place; shared by
 * the on-screen route and the Excel/PDF export loader.
 */
export function markPaidMonths(
  statement: PropertyStatement,
  monthly: Record<string, number[]>,
  period: number,
): void {
  for (const sec of statement.sections) {
    if (!sec.lines.some((l) => l.fullyFundedYtd)) continue;
    const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
    for (const l of sec.lines) {
      if (!l.fullyFundedYtd) continue;
      const amts = lineMonthly(monthly, l.mask, sign, period);
      let bi = 0;
      for (let i = 1; i < amts.length; i++) if (amts[i] > amts[bi]) bi = i;
      l.fullyFundedYtd.paidPeriod = amts.length ? bi + 1 : null;
    }
  }
}
