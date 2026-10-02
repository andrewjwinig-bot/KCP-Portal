import { describe, it, expect } from "vitest";
import { tightScale } from "./tightScale";

describe("tightScale — the bar chart's y axis", () => {
  it("puts the top just above the data, not a whole loose step over", () => {
    // A fixed four-tick step would have read $4,200 against a $6,000 axis.
    const s = tightScale(0, 4200);
    expect(s.max).toBeGreaterThanOrEqual(4200);
    expect(s.max).toBeLessThanOrEqual(5000);
    expect(s.min).toBe(0);
  });

  it("wastes at most a small fraction of the chart above the tallest bar", () => {
    for (const hi of [137, 850, 1291, 2622, 9855.68, 28350, 121000, 3_400_000]) {
      const s = tightScale(0, hi);
      expect(s.max).toBeGreaterThanOrEqual(hi);
      expect(hi / s.max).toBeGreaterThan(0.55);
    }
  });

  it("gives a small credit only the room it needs, not a full gridline step", () => {
    const s = tightScale(-120, 2622);
    expect(s.min).toBeLessThan(-120);
    expect(s.min).toBeGreaterThan(-500);
  });

  it("handles an all-credit line", () => {
    const s = tightScale(-5000, 0);
    expect(s.min).toBeLessThanOrEqual(-5000);
    expect(s.max).toBe(0);
  });
});
