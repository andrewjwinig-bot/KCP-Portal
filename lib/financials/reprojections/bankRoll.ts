// The REPROJECTED YEAR-END BANK BALANCE (owner: "takes the current bank
// balance … then populates the cash flows from reprojected months to get a
// year end projected bank balance"). Today's imported bank balance for the
// property's line, rolled to Dec 31 on the reprojection's own cash flow after
// debt service, less the distributions still planned — the SAME roll the
// budget draft opens its Projected Bank Balance on (`rollFromDate`), so the
// two pages cannot disagree. Pure: the route reads the bank and the GL.
import { rollFromDate } from "@/lib/financials/budgets/cashForecast";

export type ReprojBank = {
  /** Today's balance on the line and the date it is as of. */
  balance: number;
  asOf: string;
  /** Cash flow after debt service from the as-of date to Dec 31. */
  cashFlowRest: number;
  /** Distributions still planned after the as-of date (a positive figure). */
  distributionsRest: number;
  /** balance + cashFlowRest − distributionsRest. */
  yearEnd: number;
  accounts: { bank: string; last4: string; name: string; balance: number }[];
};

export function reprojectedBank(input: {
  line: { balance: number; asOf: string; accounts: { bank: string; last4: string; name: string; balance: number }[] } | null;
  year: number;
  /** The reprojection's monthly cash flow after debt service (blended). */
  cashFlow: number[];
  /** Planned distributions by month, and what the GL shows already paid. */
  plan: number[];
  paidOnGl: number[];
}): ReprojBank | null {
  const { line, year, cashFlow, plan, paidOnGl } = input;
  if (!line) return null;
  const all = rollFromDate(line.balance, line.asOf, year, cashFlow, plan, paidOnGl);
  if (!all) return null; // the balance is not as of the year in view
  const flowOnly = rollFromDate(0, line.asOf, year, cashFlow, new Array(12).fill(0), paidOnGl);
  const cashFlowRest = flowOnly ? flowOnly.remainder : 0;
  return {
    balance: line.balance,
    asOf: line.asOf,
    cashFlowRest,
    distributionsRest: Math.round(cashFlowRest - all.remainder),
    yearEnd: all.yearEnd,
    accounts: line.accounts.map((a) => ({ bank: a.bank, last4: a.last4, name: a.name, balance: a.balance })),
  };
}
