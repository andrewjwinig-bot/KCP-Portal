import { describe, it, expect } from "vitest";
import { capRecoveries, recoveryCheck } from "./recoveryCheck";

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

describe("the recovery check: tenants never recover more than the pool", () => {
  it("4500's $36,226/mo of RET against a $187,329 pool is scaled back to the pool, shares kept", () => {
    const e = est(36_226);
    capRecoveries(e, { cam: 0, ins: 0, ret: 187_329 });
    const total = e.monthly.ret.reduce((a: number, b: number) => a + b, 0);
    expect(Math.abs(total - 187_329)).toBeLessThan(30);
    expect(e.tenants[0].ret[0] / e.tenants[1].ret[0]).toBeCloseTo(7 / 3, 2);
    expect(e.capped.ret.before).toBe(36_226 * 12);
    const c = recoveryCheck(e).find((x) => x.group === "ret")!;
    expect(c.capped).toEqual({ before: 36_226 * 12 });
    expect(c.over).toBe(false);
  });
  it("a group under its pool is left alone", () => {
    const e = est(14_000);
    capRecoveries(e, { cam: 0, ins: 0, ret: 187_329 });
    expect(e.capped).toBeUndefined();
    expect(recoveryCheck(e)[0].ratio).toBeCloseTo(168_000 / 187_329, 6);
  });
  it("CAM + INS are checked together; admin fees can take the ceiling past 100% where the recon did", () => {
    const e = est(0, 36_000); // 432,000 a year
    e.reconCoverage.due.cam = 440_000; // recon recovered 110% of its CAM + INS pool (admin fees)
    e.reconCoverage.pool = { cam: 400_000, ins: 0, ret: 159_405 };
    capRecoveries(e, { cam: 390_000, ins: 10_000, ret: 0 });
    expect(e.capped).toBeUndefined(); // 432,000 ≤ 400,000 × 1.10
  });
  it("a hand-set estimate over the ceiling is flagged, not hidden", () => {
    const e = est(14_000);
    capRecoveries(e, { cam: 0, ins: 0, ret: 100_000 });
    e.monthly.ret = m(20_000); // an override laid on afterwards
    expect(recoveryCheck(e).find((x) => x.group === "ret")!.over).toBe(true);
  });
});
