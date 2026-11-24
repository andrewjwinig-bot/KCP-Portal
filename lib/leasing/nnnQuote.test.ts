import { describe, it, expect } from "vitest";
import { nnnTrend, quoteNnn, typicalAdminFee } from "./nnnQuote";

describe("NNN quote for a vacant suite", () => {
  const pools = { cam: 300_000, ins: 20_000, ret: 100_000 };
  it("pro-rata share of each pool, admin fee on CAM, all-in with base rent", () => {
    const q = quoteNnn(pools, 50_000, 2_000, 24, 10)!;
    // 2,000 / 50,000 = 4%: CAM 12,000 · admin 1,200 · INS 800 · RET 4,000
    expect(q.sharePct).toBeCloseTo(4);
    expect(q.lines.map((l) => [l.key, l.annual])).toEqual([["base", 48_000], ["cam", 12_000], ["admin", 1_200], ["ins", 800], ["ret", 4_000]]);
    expect(q.nnnPsf).toBe(9);           // (12,000 + 1,200 + 800 + 4,000) / 2,000
    expect(q.allInPsf).toBe(33);
    expect(q.allInMonthly).toBe(5_500); // 66,000 / 12
  });
  it("no admin fee line at 0%, and nothing to quote without SF or GLA", () => {
    expect(quoteNnn(pools, 50_000, 2_000, 24, 0)!.lines.some((l) => l.key === "admin")).toBe(false);
    expect(quoteNnn(pools, 0, 2_000, 24, 10)).toBeNull();
    expect(quoteNnn(pools, 50_000, 0, 24, 10)).toBeNull();
  });
  it("the trend is per SF of one GLA, oldest first, a year missing a pool marked partial", () => {
    const t = nnnTrend([
      { year: 2027, kind: "budget", pools: { cam: 300_000, ins: 20_000, ret: 100_000 } },
      { year: 2024, kind: "actual", pools: { cam: 330_000, ins: 19_000, ret: 101_000 } },
      { year: 2023, kind: "actual", pools: { cam: 310_000 } },
    ], 50_000);
    expect(t.map((x) => x.year)).toEqual([2023, 2024, 2027]);
    expect(t[0].partial).toBe(true);
    expect(t[1].total).toBe(9);
    expect(t[2].total).toBe(8.4);
  });
  it("the typical admin fee is the most common", () => {
    expect(typicalAdminFee([10, 10, 15, null, 0])).toBe(10);
    expect(typicalAdminFee([])).toBe(0);
  });
});
