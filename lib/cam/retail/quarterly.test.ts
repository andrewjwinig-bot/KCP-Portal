import { describe, it, expect } from "vitest";
import { QUARTERLY_BILLINGS, computeQuarterly, autoQuarterlyFromGl, mergeQuarterly, emptyQuarterlyData } from "./quarterly";

const WAWA = QUARTERLY_BILLINGS["9510-WAWA-Q"];

// Q1 2026 eligible costs straight from the workbook (1Q_2026_CAM_Wawa_LHSC),
// placed in January so the Q1 quarter-sum equals the total.
const Q1_2026: Record<string, number> = {
  "6220-8502": 7255, "6030-8502": 2227, "6330-8502": 3900, "6360-8502": 100,
  "6270-8502": 7499, "6370-8502": 46431, "6380-8502": 0, "6350-8502": 720,
  "6120-8502": 1539, "6510-8502": 9219, "6410-8502": 7976,
};
function monthlyFromQ1(byAccount: Record<string, number>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [acct, v] of Object.entries(byAccount)) { const m = new Array(12).fill(0); m[0] = v; out[acct] = m; }
  return out;
}

describe("Wawa quarterly CAM — GL auto-pull", () => {
  it("pulls each line's quarter cost from the GL by account", () => {
    const auto = autoQuarterlyFromGl(WAWA, monthlyFromQ1(Q1_2026), 3);
    expect(auto.camCosts["Building Maintenance"]?.Q1).toBe(7255);
    expect(auto.camCosts["Snow Removal"]?.Q1).toBe(46431);
    expect(auto.retCosts.Q1).toBe(7976);
    expect(auto.camCosts["Landscaping"]?.Q1).toBeUndefined(); // $0 not stored
    expect(auto.camCosts["Building Maintenance"]?.Q2).toBeUndefined(); // unposted
  });

  it("ties out the workbook: sub-total $78,890, CAM due $16,567, RET $1,675, total $18,242", () => {
    const auto = autoQuarterlyFromGl(WAWA, monthlyFromQ1(Q1_2026), 3);
    const c = computeQuarterly(WAWA, mergeQuarterly(auto, emptyQuarterlyData()));
    expect(c.camCostByQ.Q1).toBe(78890);
    expect(Math.round(c.camDueByQ.Q1)).toBe(16567);
    expect(Math.round(c.retDueByQ.Q1)).toBe(1675);
    expect(Math.round(c.dueByQ.Q1)).toBe(18242);
  });

  it("a manual entry overrides the GL value for that cell", () => {
    const auto = autoQuarterlyFromGl(WAWA, monthlyFromQ1(Q1_2026), 3);
    const manual = emptyQuarterlyData();
    manual.camCosts["Snow Removal"] = { Q1: 10000 };
    const eff = mergeQuarterly(auto, manual);
    expect(eff.camCosts["Snow Removal"].Q1).toBe(10000);
    expect(eff.camCosts["Building Maintenance"].Q1).toBe(7255);
    expect(computeQuarterly(WAWA, eff).camCostByQ.Q1).toBe(78890 - 46431 + 10000);
  });

  it("only sums posted months (a half-posted quarter is partial)", () => {
    const monthly = { "6220-8502": [100, 200, 400, 800, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(autoQuarterlyFromGl(WAWA, monthly, 2).camCosts["Building Maintenance"]?.Q1).toBe(300);
    expect(autoQuarterlyFromGl(WAWA, monthly, 4).camCosts["Building Maintenance"]?.Q2).toBe(800);
  });
});

describe("quarterly billing (Wawa @ 9510)", () => {
  const def = QUARTERLY_BILLINGS["9510-WAWA-Q"];

  it("applies the 21% lease share per quarter and backs out billed/paid YTD", () => {
    const data = emptyQuarterlyData();
    data.camCosts["Building Maintenance"] = { Q4: 41445.13 }; // Q4 eligible CAM (from the quarterly report)
    data.retCosts.Q1 = 7681.38;
    data.billed.Q4 = 8703.48; // billed the Q4 CAM share exactly
    const c = computeQuarterly(def, data);
    expect(Math.abs(c.camDueByQ.Q4 - 8703.48)).toBeLessThan(0.5); // 21% × 41,445.13
    expect(Math.abs(c.retDueByQ.Q1 - 1613.09)).toBeLessThan(0.5); // 21% × 7,681.38
    expect(Math.abs(c.dueYtd - (c.camDueYtd + c.retDueYtd))).toBeLessThan(0.01);
    expect(Math.abs(c.balanceYtd - (c.dueYtd - 8703.48))).toBeLessThan(0.01);
  });
});
