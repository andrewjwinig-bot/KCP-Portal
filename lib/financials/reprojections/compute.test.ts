import { describe, it, expect } from "vitest";
import { reproject, type ReprojectInput } from "./compute";
import type { StatementMapping } from "@/lib/financials/operating-statements/types";

const mapping: StatementMapping = {
  propertyCode: "TEST",
  entityName: "Test Center LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [{ label: "Rental income", mask: "4230-*" }] },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [{ label: "Maintenance", mask: "6030-8502" }] },
  ],
};

const m = (v: number) => new Array(12).fill(v);

// Rental income: actual -100/mo (credit), budget 90/mo. Maintenance: actual
// 30/mo, budget 25/mo. Actuals through month 3.
const input: ReprojectInput = {
  mapping,
  propertyName: "Test Center",
  year: 2026,
  glMonthly: {
    "4230-8501": m(-100),
    "6030-8502": m(30),
    "6810-8501": m(5), // unmapped (depreciation)
  },
  budgetLines: [
    { glAccount: "4230-8501", months: m(90) },
    { glAccount: "6030-8502", months: m(25) },
  ],
  actualThroughMonth: 3,
};

describe("reprojection compute", () => {
  const r = reproject(input);
  const rent = r.sections[0].lines[0];

  it("flips revenue credits positive and blends actual→budget at the boundary", () => {
    // Months 1-3 actual (100), months 4-12 budget (90).
    expect(rent.actual.slice(0, 3)).toEqual([100, 100, 100]);
    expect(rent.blended[0]).toBe(100); // Jan = actual
    expect(rent.blended[2]).toBe(100); // Mar = actual (through month 3)
    expect(rent.blended[3]).toBe(90); // Apr = budget
    expect(rent.blended[11]).toBe(90); // Dec = budget
  });

  it("reprojected full-year = 3 actual + 9 budget", () => {
    expect(rent.reprojTotal).toBe(3 * 100 + 9 * 90); // 1110
    expect(rent.budgetTotal).toBe(12 * 90); // 1080
    // Revenue favorable when reproj > budget.
    expect(rent.variance).toBe(1110 - 1080); // +30
  });

  it("expense variance is favorable when reproj is UNDER budget", () => {
    const maint = r.sections[1].lines[0];
    // 3*30 + 9*25 = 315 reproj vs 300 budget → over budget → unfavorable (negative).
    expect(maint.reprojTotal).toBe(315);
    expect(maint.variance).toBe(-(315 - 300)); // -15
  });

  it("rolls up NOI = revenue − expense on the blended series", () => {
    expect(r.rollups.totalRevenues.reprojTotal).toBe(1110);
    expect(r.rollups.totalOperatingExpenses.reprojTotal).toBe(315);
    expect(r.rollups.netOperatingIncome.reprojTotal).toBe(1110 - 315);
  });

  it("surfaces unbudgeted actuals (accounts with no mapped line)", () => {
    expect(r.unbudgetedAccounts).toEqual([{ account: "6810-8501", actualTotal: 60 }]);
  });

  it("actualThroughMonth 0 → pure budget; 12 → pure actual", () => {
    const allBudget = reproject({ ...input, actualThroughMonth: 0 });
    expect(allBudget.sections[0].lines[0].reprojTotal).toBe(1080);
    const allActual = reproject({ ...input, actualThroughMonth: 12 });
    expect(allActual.sections[0].lines[0].reprojTotal).toBe(1200);
  });
});
