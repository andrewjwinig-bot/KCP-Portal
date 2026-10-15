import { describe, it, expect } from "vitest";
import { t12Window, t12Labels, t12Span, stitchMonthly, missingMonths } from "./window";

describe("T-12 window", () => {
  it("runs the twelve months ending at the posted month, across the year boundary", () => {
    const w = t12Window(2026, 8);
    expect(w[0]).toEqual({ year: 2025, month: 9 });
    expect(w[3]).toEqual({ year: 2025, month: 12 });
    expect(w[4]).toEqual({ year: 2026, month: 1 });
    expect(w[11]).toEqual({ year: 2026, month: 8 });
    expect(t12Labels(w)[0]).toBe("Sep 25");
    expect(t12Span(w)).toBe("Sep 2025 – Aug 2026");
  });
  it("a December end is simply that calendar year", () => {
    const w = t12Window(2025, 12);
    expect(w[0]).toEqual({ year: 2025, month: 1 });
    expect(w[11]).toEqual({ year: 2025, month: 12 });
  });
  it("lays each account's months end to end from the two years' GLs", () => {
    const w = t12Window(2026, 2);
    const prev = { "4230-0000": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
    const cur = { "4230-0000": [13, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "6120-8501": [5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const s = stitchMonthly(w, { 2025: prev, 2026: cur });
    expect(s["4230-0000"]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(s["6120-8501"].slice(10)).toEqual([5, 6]);
    expect(s["6120-8501"][0]).toBe(0);
  });
  it("names the months no GL covers", () => {
    const w = t12Window(2026, 8);
    const miss = missingMonths(w, { 2025: 10, 2026: 8 });
    expect(miss).toEqual([{ year: 2025, month: 11 }, { year: 2025, month: 12 }]);
  });
});
