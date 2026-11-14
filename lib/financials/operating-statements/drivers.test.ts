import { describe, it, expect } from "vitest";
import { driverIndexes } from "./drivers";

const idx = (amounts: number[]) => [...driverIndexes(amounts)].sort((a, b) => a - b);

describe("which transactions drive a line", () => {
  it("marks NOTHING when the charges are a recurring series", () => {
    // Four monthly Hampton Property Maintenance landscaping invoices, within 1%
    // of each other. Each is 25% of the line, which the old share-only test read
    // as four drivers. It is a contract posting on schedule — nothing stands out.
    expect(idx([1155.36, 1147.06, 1158.66, 1143.71])).toEqual([]);
  });

  it("marks the one charge that does stand out", () => {
    // Parking Lot Maintenance: a repaving job among ordinary upkeep.
    expect(idx([21_750, 3_000, 2_000, 1_600])).toEqual([0]);
  });

  it("marks both when two large items share the line", () => {
    expect(idx([9_000, 8_400, 900, 700])).toEqual([0, 1]);
  });

  it("never marks a lone transaction", () => {
    // Trivially 100% of its own line, so the mark would say nothing.
    expect(idx([21_750])).toEqual([]);
  });

  it("marks the larger of two when one genuinely dominates", () => {
    expect(idx([9_000, 1_000])).toEqual([0]);
  });

  it("marks neither of two near-equal charges", () => {
    expect(idx([5_000, 5_000])).toEqual([]);
    expect(idx([5_000, 4_600])).toEqual([]);
  });

  it("handles credits by magnitude, not sign", () => {
    // A large credit is as much worth looking at as a large charge.
    expect(idx([-12_000, 900, 800, 750])).toEqual([0]);
  });

  it("survives an empty or all-zero line", () => {
    expect(idx([])).toEqual([]);
    expect(idx([0, 0, 0])).toEqual([]);
  });

  it("ignores small charges however many there are", () => {
    expect(idx([100, 100, 100, 100, 100, 100, 100, 100, 100, 100])).toEqual([]);
  });
});
