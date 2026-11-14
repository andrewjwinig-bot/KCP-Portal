import { describe, expect, it } from "vitest";
import { cumulative, performanceOf } from "./performance";
import type { Reprojection, ReprojTotals } from "@/lib/financials/reprojections/compute";

const T = (actual: number[], budget: number[], through: number): ReprojTotals => {
  const blended = budget.map((b, i) => (i < through ? actual[i] : b));
  const s = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return { actual, budget, blended, reprojTotal: s(blended), budgetTotal: s(budget), variance: null };
};
const m = (v: number) => new Array(12).fill(v);
const zero = T(m(0), m(0), 3);

const rep = (): Reprojection => ({
  propertyCode: "9510", propertyName: "X", year: 2026, actualThroughMonth: 3, unbudgetedAccounts: [],
  sections: [
    { name: "Revenues", role: "revenue", subtotal: zero, lines: [
      { label: "Rental income", mask: "4230-*", actual: [110, 110, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0], budget: m(100), blended: [], reprojTotal: 0, budgetTotal: 1200, variance: null },
    ] },
    { name: "Non-Reimbursable Expenses", role: "non-reimbursable-expense", subtotal: zero, lines: [
      { label: "Legal", mask: "8310-*", actual: [50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0], budget: m(20), blended: [], reprojTotal: 0, budgetTotal: 240, variance: null },
    ] },
    { name: "Capital", role: "capital", subtotal: zero, lines: [
      { label: "TI", mask: "1440-*", actual: m(999), budget: m(0), blended: [], reprojTotal: 0, budgetTotal: 0, variance: null },
    ] },
  ],
  rollups: {
    totalRevenues: T([110, 110, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0], m(100), 3),
    totalOperatingExpenses: T([50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0], m(20), 3),
    netOperatingIncome: T([60, 60, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0], m(80), 3),
    capital: zero, cashFlowBeforeDebtService: zero, totalDebtService: zero, cashFlowAfterDebtService: zero,
  },
});

describe("property performance", () => {
  it("YTD is the posted months; the full year is the reprojection", () => {
    const p = performanceOf("9510", rep());
    expect(p.through).toBe(3);
    expect(p.noi.ytdActual).toBe(180);
    expect(p.noi.ytdBudget).toBe(240);
    expect(p.noi.fullYearReproj).toBe(180 + 9 * 80);
    expect(p.noi.fullYearBudget).toBe(960);
    expect(p.cashFlow).toBeNull(); // no debt
  });
  it("variance is favorable-signed and capital is not an operating driver", () => {
    const p = performanceOf("9510", rep());
    expect(p.lines.map((l) => [l.label, l.variance])).toEqual([["Legal", -90], ["Rental income", 30]]);
  });
  it("cumulative runs the total", () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]);
  });
});
