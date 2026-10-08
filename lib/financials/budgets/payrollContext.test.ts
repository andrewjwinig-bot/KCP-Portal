import { describe, it, expect } from "vitest";
import { recoveryRateOf, payrollContextFrom } from "./payrollContext";

const line = (label: string, total: number, sub = false) => ({ glAccount: sub ? null : "1", subCategory: null, label, months: [], total, totalPsf: null, input: null, notes: null, isSubtotal: sub } as any);
const prop = (code: string, recovered: number, pool: number, noi = 100) => ({
  propertyCode: code, propertyName: code, rentableSqft: 0, occupancyPct: [], occupancySqft: [],
  sections: [
    { name: "Reimbursements", lines: [line("CAM", recovered), line("Total Reimbursements", recovered, true)] },
    { name: "Reimbursable Expenses", lines: [line("Snow", pool)] },
    { name: "Non-Reimbursable Expenses", lines: [line("Legal", 999)] },
  ],
  rollups: [{ name: "TOTAL REVENUES", total: 500, months: [] }, { name: "NET OPERATING INCOME", total: noi, months: [] }, { name: "CASH FLOW AFTER DEBT SERVICE", total: 40, months: [] }],
} as any);

describe("what a raise is measured against", () => {
  it("recovery rate = reimbursements ÷ reimbursable expenses, capped at 100%", () => {
    expect(recoveryRateOf(prop("4500", 80, 100))).toBeCloseTo(0.8);
    expect(recoveryRateOf(prop("4500", 130, 100))).toBe(1);
    expect(recoveryRateOf(prop("4500", 0, 100))).toBe(0);
  });
  it("reads the payroll year's budget, else the one before it", () => {
    const wb = (year: number, noi: number) => ({ id: `w${year}`, year, kind: "published", status: "final", uploadedAt: "", label: "", properties: [prop("4500", 80, 100, noi)] } as any);
    const c = payrollContextFrom([wb(2025, 1), wb(2026, 2)], 2027);
    expect(c["4500"]).toMatchObject({ year: 2026, noi: 2, revenue: 500, cashFlowAfterDebt: 40 });
    expect(payrollContextFrom([wb(2026, 2), wb(2027, 3)], 2027)["4500"].noi).toBe(3);
  });
});
