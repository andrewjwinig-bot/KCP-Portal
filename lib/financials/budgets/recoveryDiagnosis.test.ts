import { describe, it, expect } from "vitest";
import { diagnoseRecovery, mainCause } from "./recoveryDiagnosis";
import type { EstimateRow, WhyPart } from "./estimatesByTenant";
import type { ReimbursementEstimate } from "./reimbursementEstimate";

// A 10,000 SF centre with a $100,000 CAM pool and no admin fees.
const est = { pools: { cam: 100_000, ins: 0, ret: 0 } } as unknown as ReimbursementEstimate;
const why = (year: number, over = false): WhyPart[] => [{
  part: "cam", now: 0, recon: null, next: year / 12, catchUp: null, budgetChange: null, poolPct: null,
  overridden: over, computed: over ? 400 : undefined, year, months: 12,
}];
const retail = (prs: number) => ({ kind: "retail", adminFeePct: 0, basis: { cam: { expense: 100_000, gla: 10_000, sf: 0, prs, share: 0, admin: 0, adminPct: 0, discountPct: 0, year: 0 } } });
const row = (unitRef: string, sqft: number, year: number, method: unknown, over = false) =>
  ({ unitRef, tenant: unitRef, sqft, why: why(year, over), method, assumed: false } as unknown as EstimateRow);

describe("recovery diagnosis", () => {
  it("names the tenants above their SF share and why", () => {
    const rows = [
      row("A", 2_000, 30_000, retail(30)),                 // lease says 30%, SF says 20%
      row("B", 5_000, 50_000, retail(50)),                 // right on its share
      row("C", 3_000, 40_000, { kind: "new", sqft: 3_000, assumption: "held" }),
      row("D", 1_000, 15_000, retail(10), true),           // set by hand
    ];
    const d = diagnoseRecovery(rows, est, "camIns")!;
    expect(d.tenants.map((t) => [t.unitRef, t.cause, t.excess])).toEqual([
      ["A", "stipulated", 10_000], ["C", "held", 10_000], ["D", "hand", 5_000],
    ]);
    expect(d.tenants[0].detail).toBe("CAM share 30.00% set by the lease vs 20.00% by SF");
    expect(d.shareSumPct).toBe(90);
    expect(mainCause(d)).toMatch(/^40% of it is/);
  });
});
