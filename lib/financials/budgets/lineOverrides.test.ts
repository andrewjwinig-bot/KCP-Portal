import { describe, it, expect } from "vitest";
import { applyEdit, mergeMonths, spreadEvenly, lineKey } from "./lineOverrides";

const computed = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
const K = lineKey("Operating Expenses", "Parking Lot Maintenance");

describe("typed budget months", () => {
  it("a typed month replaces only that month", () => {
    const doc = applyEdit({}, K, 5, 21750, "DREW", "t");
    const { months, typed } = mergeMonths(computed, doc[K]);
    expect(months[5]).toBe(21750);
    expect(months.filter((m, i) => i !== 5).every((m) => m === 100)).toBe(true);
    expect(typed.filter(Boolean)).toHaveLength(1);
    expect(doc[K].by).toBe("DREW");
  });

  it("zero is a figure; clearing hands the month back to the computed one", () => {
    let doc = applyEdit({}, K, 0, 0);
    expect(mergeMonths(computed, doc[K]).months[0]).toBe(0);
    doc = applyEdit(doc, K, 0, null);
    expect(doc[K]).toBeUndefined(); // nothing typed left → the line is dropped
    expect(mergeMonths(computed, doc[K]).months[0]).toBe(100);
  });

  it("an annual spreads evenly in whole dollars that add back exactly", () => {
    const s = spreadEvenly(10_000);
    expect(s.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    const neg = spreadEvenly(-1_001);
    expect(neg.reduce((a, b) => a + b, 0)).toBe(-1_001);
    const doc = applyEdit({}, K, "all", 6_000);
    expect(mergeMonths(computed, doc[K]).typed.every(Boolean)).toBe(true);
  });

  it("clearing the line removes every typed month", () => {
    let doc = applyEdit({}, K, 3, 50);
    doc = applyEdit(doc, K, 7, 70);
    doc = applyEdit(doc, K, "all", null);
    expect(doc[K]).toBeUndefined();
  });

  it("rejects a month outside the year", () => {
    expect(() => applyEdit({}, K, 12, 1)).toThrow();
  });
});
