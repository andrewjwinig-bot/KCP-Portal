// Robert Half (4070-201): the one lease whose base-year stop is on the expense
// TOTAL, not line-by-line, with recovery prorated through 5/31/2025. Ties to the
// "Schedule of Expenses" workbook: Net Increase 65,526; Amount Due 1,708;
// Balance −3,292; RET Net Increase 8,747, due 228.

import { describe, it, expect } from "vitest";
import { reconcileTenant } from "./compute";
import { POOL_4070_WORKBOOK, TENANTS_4070_2025 } from "./seed/4070";

const r0 = (n: number) => Math.round(n);
const t201 = () => TENANTS_4070_2025.find((t) => t.unitRef === "4070-201")!;

describe("Robert Half 4070-201 — aggregate base year + 5/31 reset", () => {
  const t = t201();
  const r = reconcileTenant(POOL_4070_WORKBOOK, t, 2025);

  it("recovery is prorated through 5/31 (151/365 = 41.37%)", () => {
    expect(t.aggregateBaseYear).toBe(true);
    expect(Math.round(t.recoveryPct * 10000) / 100).toBe(41.37);
  });

  it("net increase is the TOTAL over base, not the per-line floored sum", () => {
    // Per-line flooring would drop the lines that fell below base (Maint
    // Salaries, Security, Landscaping) and over-recover; the aggregate nets them.
    expect(r0(r.opexBaseTotal)).toBe(320595);
    expect(r0(r.opexActualTotal)).toBe(386122);
    expect(r0(r.opexNetIncrease)).toBe(65526);
    const perLineFloored = r.opexLines.reduce((a, l) => a + l.netIncrease, 0);
    expect(perLineFloored).toBeGreaterThan(r.opexNetIncrease); // proves it's not per-line
  });

  it("Amount Due and Balance tie to the schedule", () => {
    expect(r0(r.opexAmountDue)).toBe(1708);
    expect(r0(r.opexBalance)).toBe(-3292); // 1708 − 5000 escrow
  });

  it("RET ties to the schedule", () => {
    expect(r0(r.retLine.netIncrease)).toBe(8747); // 151,204 − 142,457
    expect(r0(r.retAmountDue)).toBe(228);
    expect(r0(r.retBalance)).toBe(228); // no RET escrow
  });

  it("flags the aggregate basis on the result", () => {
    expect(r.aggregateBaseYear).toBe(true);
  });
});
