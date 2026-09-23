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
