import { describe, it, expect } from "vitest";
import { breakdownRows, expenseDrivers, driverText } from "./estimateBreakdown";
import type { EstimateRow, WhyPart } from "./estimatesByTenant";

// A retail tenant at 10%: CAM lines Snow 60,000 → 60,000, Landscaping 24,000 → 36,000.
const line = (label: string, actual: number, budget: number) =>
  ({ label, glAccount: "", actual, projected: null, budget, from: "budget", billed: true, adminExcluded: false });
const method = {
  kind: "retail",
  basis: {
    cam: { expense: 96_000, gla: 10_000, sf: 1_000, prs: 10, share: 9_600, admin: 0, adminPct: 0, discountPct: 0, year: 9_600,
      lines: [line("Snow Removal", 60_000, 60_000), line("Landscaping", 24_000, 36_000)] },
  },
} as unknown as EstimateRow["method"];

const why = (now: number): WhyPart[] => [{
  part: "cam", now, recon: 700, next: 800, catchUp: 700 - now, budgetChange: 100, poolPct: null, overridden: false, year: 9_600, months: 12,
}];

describe("estimate breakdown", () => {
  it("splits the estimate by line and ties to the year and the recon", () => {
    const rows = breakdownRows(method, why(700));
    const snow = rows.find((r) => r.label === "Snow Removal")!;
    expect(snow.annual).toBeCloseTo(6_000);
    expect(snow.prior).toBeCloseTo(6_000);
    expect(rows.reduce((a, r) => a + r.annual, 0)).toBeCloseTo(9_600);
    expect(rows.reduce((a, r) => a + (r.prior ?? 0), 0)).toBeCloseTo(8_400);
  });

  it("names the line that moved when today matches the recon", () => {
    const d = expenseDrivers(method, why(700));
    expect(d[0]).toMatchObject({ label: "Landscaping", monthly: 100 });
    expect(driverText(d, 100)).toBe("Landscaping +$100, line up 50%");
  });

  it("calls out snow left out of today's estimate", () => {
    // Today $200 a month: $500 short of the recon, the snow share being $500.
    const d = expenseDrivers(method, why(200));
    expect(d[0]).toMatchObject({ label: "Snow Removal", monthly: 500, notInToday: true });
    expect(driverText(d, 600)).toBe("Snow Removal +$500 (not in today's estimate) · Landscaping +$100, line up 50%");
  });
});
