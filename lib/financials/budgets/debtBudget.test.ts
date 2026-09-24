import { describe, it, expect } from "vitest";
import { budgetDebt, loansForStatement } from "./debtBudget";
import type { Loan } from "@/lib/debt/amortization";

const base: Loan = {
  id: "a", property: "2300", partnership: "", collateral: "", lender: "Bank", group: "Shopping Centers",
  originalBalance: 1_200_000, annualRatePct: 6, amortYears: 25, scheduledPayment: 7_731.62,
  maturityDate: "2032-01-01", anchorBalance: 1_000_000, anchorDate: "2026-06-01", interestOnly: false, notes: "",
};

describe("budget-year debt service", () => {
  it("takes each month's interest and principal from the loan's schedule", () => {
    const d = budgetDebt([base], 2027)!;
    // Interest falls and principal rises through an amortizing year.
    expect(d.interest[0]).toBeGreaterThan(d.interest[11]);
    expect(d.principal[11]).toBeGreaterThan(d.principal[0]);
    // Every month's P&I is the scheduled payment.
    for (let m = 0; m < 12; m++) expect(Math.abs(d.interest[m] + d.principal[m] - 7_732)).toBeLessThanOrEqual(1);
    expect(d.loans[0].balanceEnd).toBeLessThan(d.loans[0].balanceStart);
    expect(d.loans[0].refinanceAssumed).toBe(false);
  });

  it("keeps paying an interest-only loan that matures mid-year, and says so", () => {
    const io: Loan = { ...base, interestOnly: true, maturityDate: "2027-06-01", anchorBalance: 2_000_000 };
    const d = budgetDebt([io], 2027)!;
    expect(d.interest.every((m) => Math.abs(m - 10_000) <= 1)).toBe(true); // 2M × 6% / 12, all year
    expect(d.principal.every((m) => m === 0)).toBe(true);
    expect(d.loans[0].refinanceAssumed).toBe(true);
  });

  it("routes a holding-entity loan to its fund statement", () => {
    const jv = { ...base, id: "jv", property: "3600" };
    expect(loansForStatement([base, jv], "PJV3").map((l) => l.id)).toEqual(["jv"]);
    expect(loansForStatement([base, jv], "2300", "2300").map((l) => l.id)).toEqual(["a"]);
  });

  it("no loans → nothing to budget from", () => {
    expect(budgetDebt([], 2027)).toBeNull();
  });
});

import { fundDebtShares, shareOfDebt, addDebt } from "./debtBudget";

describe("a fund's loans, allocated to its buildings", () => {
  it("follows last year's budget of record, building by building", () => {
    const { shares, basis } = fundDebtShares([
      { code: "3610", priorDebt: 60000, sqft: 41821 },
      { code: "3620", priorDebt: 30000, sqft: 49020 },
      { code: "3640", priorDebt: 10000, sqft: 48794 },
    ]);
    expect(basis).toBe("prior-budget");
    expect(shares).toEqual({ "3610": 0.6, "3620": 0.3, "3640": 0.1 });
  });
  it("falls back to square footage when no prior budget carried debt", () => {
    const { shares, basis } = fundDebtShares([{ code: "A", priorDebt: 0, sqft: 750 }, { code: "B", priorDebt: 0, sqft: 250 }]);
    expect(basis).toBe("sqft");
    expect(shares).toEqual({ A: 0.75, B: 0.25 });
  });
  it("scales the schedule to the share, and adds to a building's own loans", () => {
    const fund = { interest: new Array(12).fill(1000), principal: new Array(12).fill(500), loans: [{ id: "L1", lender: "Bank", ratePct: 6, interestOnly: false, maturityDate: "2030-01-01", balanceStart: 1e6, balanceEnd: 9e5, interest: 12000, principal: 6000, refinanceAssumed: false }] };
    const part = shareOfDebt(fund, 0.25);
    expect(part.interest[0]).toBe(250);
    expect(part.loans[0]).toMatchObject({ interest: 3000, principal: 1500, share: 0.25, balanceStart: 1e6 });
    const both = addDebt({ interest: new Array(12).fill(10), principal: new Array(12).fill(0), loans: [] }, part)!;
    expect(both.interest[0]).toBe(260);
    expect(both.loans).toHaveLength(1);
  });
});
