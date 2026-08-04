import { describe, it, expect } from "vitest";
import { amountAnomaly, countAnomaly, yoyAnomaly, trendFlags } from "./trends";

describe("operating-statement trend signals", () => {
  it("flags an amount that departs from the recent run", () => {
    expect(amountAnomaly([1000, 1050, 980, 3000])).toBe(true);   // spike
    expect(amountAnomaly([1000, 1050, 980, 1020])).toBe(false);  // steady
    expect(amountAnomaly([1000, 1100])).toBe(false);             // not enough history
    expect(amountAnomaly([1000, 1000, 1000, 1100])).toBe(false); // <$500 / <40% move
  });

  it("flags a transaction-count change vs a steady prior pattern", () => {
    expect(countAnomaly([2, 2, 2, 1])).toBe(true);  // a utility bill went missing
    expect(countAnomaly([2, 2, 2, 3])).toBe(true);  // an extra payment (possible double-pay)
    expect(countAnomaly([2, 2, 2, 2])).toBe(false); // consistent
    expect(countAnomaly([2, 3, 2, 2])).toBe(false); // prior wasn't consistent
    expect(countAnomaly([2, 2])).toBe(false);       // not enough history
  });

  it("flags a year-over-year same-month swing", () => {
    expect(yoyAnomaly(3000, 1000)).toBe(true);
    expect(yoyAnomaly(1020, 1000)).toBe(false);
    expect(yoyAnomaly(1000, null)).toBe(false);
  });

  it("collects human-readable reasons", () => {
    expect(trendFlags([1000, 1050, 980, 3000], [2, 2, 2, 1], 3000, 1000)).toEqual([
      "amount differs sharply from recent months",
      "transaction count differs from recent months",
      "differs from the same month last year",
    ]);
    expect(trendFlags([1000, 1020], [2, 2])).toEqual([]);
  });
});
