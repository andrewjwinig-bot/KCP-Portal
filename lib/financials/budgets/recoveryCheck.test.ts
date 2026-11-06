import { describe, it, expect } from "vitest";
import { attachPools, recoveryCheck } from "./recoveryCheck";

const m = (v: number) => new Array(12).fill(v);
const est = (ret: number, cam = 0): any => ({
  reconYear: 2025, budgetYear: 2027, ratios: { cam: 1, ins: 1, ret: 1 },
  tenants: [
    { unitRef: "4500-3021", cam: m(cam * 0.7), ins: m(0), ret: m(ret * 0.7), camAnnual: 0, insAnnual: 0, retAnnual: 0 },
    { unitRef: "4500-2891", cam: m(cam * 0.3), ins: m(0), ret: m(ret * 0.3), camAnnual: 0, insAnnual: 0, retAnnual: 0 },
  ],
  monthly: { cam: m(cam), ins: m(0), ret: m(ret) }, totals: {},
  reconCoverage: { due: { cam: 400_000, ins: 10_000, ret: 140_000 }, pool: { cam: 400_000, ins: 11_645, ret: 159_405 } },
});

describe("the recovery check: a review flag, never an adjustment", () => {
  it("4500's $36,226/mo of RET against a $187,329 pool is FLAGGED and left as the methodology set it", () => {
    const e = est(36_226);
    attachPools(e, { cam: 0, ins: 0, ret: 187_329 });
    expect(e.monthly.ret[0]).toBe(36_226); // nothing scaled back
    const c = recoveryCheck(e).find((x) => x.group === "ret")!;
    expect(c.over).toBe(true);
  });
  it("a fully leased NNN centre past 100% on admin fees is NOT flagged", () => {
    const e = est(0, 36_000); // 432,000 a year on a 400,000 pool = 108%
    e.reconCoverage = undefined;
    attachPools(e, { cam: 390_000, ins: 10_000, ret: 0 });
    const c = recoveryCheck(e).find((x) => x.group === "camIns")!;
    expect(c.ratio).toBeCloseTo(1.08, 2);
    expect(c.over).toBe(false);
  });
  it("the recon year's own ratio raises the ceiling where it was higher", () => {
    const e = est(0, 40_000); // 480,000 = 120% of 400,000
    e.reconCoverage.due.cam = 490_000; // recon recovered ~122.5% of its pool
    e.reconCoverage.pool = { cam: 400_000, ins: 0, ret: 159_405 };
    attachPools(e, { cam: 390_000, ins: 10_000, ret: 0 });
    expect(recoveryCheck(e).find((x) => x.group === "camIns")!.over).toBe(false);
  });
  it("a group under its pool reads its ratio", () => {
    const e = est(14_000);
    attachPools(e, { cam: 0, ins: 0, ret: 187_329 });
    expect(recoveryCheck(e)[0].ratio).toBeCloseTo(168_000 / 187_329, 6);
    expect(recoveryCheck(e)[0].over).toBe(false);
  });
});

import { officeRecovery } from "./recoveryMath";

describe("office recoveries: a tenant pays only what is over its base year", () => {
  const base = { unitRef: "4060-205", name: "Presidential Bank", sqft: 2000, proRataPct: 10, retBase: 50_000, retActual: 60_000, opexBaseTotal: 200_000, opexActualTotal: 200_000 };
  const ratio = (cam: number, ret: number) => ({ cam, ins: 1, ret });
  it("Op Ex is stopped LINE BY LINE — a line under its base never offsets one over it", () => {
    // Line A $20K over base, line B $20K under: the total nets to zero, the recon charges line A.
    const r = officeRecovery({ ...base, opexLines: [{ actual: 120_000, baseCost: 100_000 }, { actual: 80_000, baseCost: 100_000 }] }, ratio(1, 1));
    expect(r.camYear).toBe(2_000); // 10% × $20,000
  });
  it("an aggregate-stop lease nets the total", () => {
    const r = officeRecovery({ ...base, aggregateBaseYear: true, opexLines: [{ actual: 120_000, baseCost: 100_000 }, { actual: 80_000, baseCost: 100_000 }] }, ratio(1, 1));
    expect(r.camYear).toBe(0);
  });
  it("RET below the base year — the business parks' 2026 reassessment — is $0, never a credit", () => {
    const r = officeRecovery(base, ratio(1, 0.5)); // $60K → $30K budget, base $50K
    expect(r.retYear).toBe(0);
  });
  it("a base year after the last recon (its dollars not known yet) budgets nothing", () => {
    const r = officeRecovery({ ...base, opexBaseTotal: 0, retBase: 0, baseUnknown: true }, ratio(1.1, 1.1));
    expect([r.camYear, r.retYear]).toEqual([0, 0]);
  });
});

describe("office Op Ex on each line's OWN budget", () => {
  it("a line's budget, not the building rate, decides whether it crosses base", () => {
    // Snow falls, electric rises: the building rate (×1.0) would say neither moves.
    const r = officeRecovery({
      unitRef: "4070-301", name: "Veltri", sqft: 3000, proRataPct: 10,
      opexBaseTotal: 200_000, opexActualTotal: 200_000, retBase: 0, retActual: 0,
      opexLines: [
        { label: "Snow Removal", account: "6280-8502", actual: 100_000, baseCost: 100_000, budget: 70_000 },
        { label: "Electric", account: "6410-8502", actual: 100_000, baseCost: 100_000, budget: 130_000 },
      ],
    }, { cam: 1, ins: 1, ret: 1 });
    expect(r.camYear).toBe(3_000); // 10% × electric's $30,000 over base; snow under base is $0
    expect(r.opexDetail!.map((l) => [l.label, l.over, l.fromLine])).toEqual([["Snow Removal", 0, true], ["Electric", 30_000, true]]);
  });
});
