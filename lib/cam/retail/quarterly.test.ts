import { describe, it, expect } from "vitest";
import { QUARTERLY_BILLINGS, computeQuarterly, emptyQuarterlyData } from "./quarterly";

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
