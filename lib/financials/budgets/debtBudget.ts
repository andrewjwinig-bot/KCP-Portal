// Budget-year debt service from the Debt Tracker — the lender's own schedule,
// not this year's figure copied forward.
//
// Each loan's amortization schedule (`buildSchedule`: amortizing, interest-
// only, fixed-principal amendments) gives the budget year's interest and
// principal month by month. Interest lands on the statement's Interest line
// (9210), principal on Mortgage Amortization (2720/2740). A loan booked at the
// holding entity (3600 Lincoln JV III, 4000 Neshaminy Interplex) belongs on its
// FUND statement, the same mapping the Cash Sheet uses.
//
// A loan that MATURES before or during the budget year is assumed refinanced
// on the same terms — the budget keeps paying it — and says so, because a
// budget that silently stops paying a mortgage in June overstates cash flow by
// the rest of the year's debt service.
//
// Pure — no storage — so it is tested directly.

import { buildSchedule, type Loan } from "@/lib/debt/amortization";

/** Loans whose `property` is the holding entity → the statement that carries them. */
export const LOAN_TO_STATEMENT: Record<string, string> = { "3600": "PJV3", "4000": "PNIPLX" };

export type BudgetLoan = {
  id: string;
  lender: string;
  ratePct: number;
  interestOnly: boolean;
  maturityDate: string;
  /** Balance at the start and end of the budget year. */
  balanceStart: number;
  balanceEnd: number;
  interest: number;
  principal: number;
  /** Matures before or during the budget year — refinance assumed. */
  refinanceAssumed: boolean;
};

export type DebtBudget = {
  interest: number[];
  principal: number[];
  loans: BudgetLoan[];
};

const r0 = (n: number) => Math.round(n);
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

export function loansForStatement(loans: Loan[], key: string, propertyCode?: string | null): Loan[] {
  const want = new Set([key.toUpperCase(), (propertyCode ?? "").toUpperCase()].filter(Boolean));
  return loans.filter((l) => l.property && want.has((LOAN_TO_STATEMENT[l.property] ?? l.property).toUpperCase()));
}

/** The budget year's debt service for one statement, or null with no loans. */
export function budgetDebt(loans: Loan[], year: number): DebtBudget | null {
  if (!loans.length) return null;
  const interest = new Array(12).fill(0);
  const principal = new Array(12).fill(0);
  const out: BudgetLoan[] = [];
  for (const loan of loans) {
    const rows = buildSchedule(loan, `${year}-01-01`);
    const monthlyRate = loan.annualRatePct / 100 / 12;
    const byMonth = new Map<number, { interest: number; principal: number; closing: number; opening: number }>();
    for (const r of rows) {
      const [y, m] = r.date.split("-").map(Number);
      if (y === year) byMonth.set(m - 1, { interest: r.interest, principal: r.principal, closing: r.closingBalance, opening: r.openingBalance });
    }
    // The balance going into the year: the last scheduled closing before it,
    // else the anchor.
    const before = rows.filter((r) => r.date < `${year}-01-01`);
    let balance = before.length ? before[before.length - 1].closingBalance : loan.anchorBalance;
    const start = balance;
    const refinanceAssumed = loan.maturityDate < `${year + 1}-01-01`;
    let li = 0, lp = 0;
    for (let m = 0; m < 12; m++) {
      const row = byMonth.get(m);
      let i: number, p: number;
      if (row) {
        i = row.interest; p = row.principal; balance = row.closing;
      } else if (balance > 0.01 && refinanceAssumed) {
        // Past maturity with no scheduled row (an interest-only loan's schedule
        // ends at maturity): carry it on the same terms.
        i = balance * monthlyRate;
        p = loan.interestOnly ? 0 : Math.min(balance, Math.max(0, loan.scheduledPayment - i));
        balance -= p;
      } else {
        i = 0; p = 0;
      }
      interest[m] += i; principal[m] += p; li += i; lp += p;
    }
    out.push({
      id: loan.id, lender: loan.lender, ratePct: loan.annualRatePct, interestOnly: loan.interestOnly,
      maturityDate: loan.maturityDate, balanceStart: r0(start), balanceEnd: r0(balance),
      interest: r0(li), principal: r0(lp), refinanceAssumed,
    });
  }
  // Whole dollars that add back to the loans' totals.
  return { interest: interest.map(r0), principal: principal.map(r0), loans: out };
}

export const debtTotal = (d: DebtBudget) => sum(d.interest) + sum(d.principal);
