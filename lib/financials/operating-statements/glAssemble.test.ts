import { describe, it, expect } from "vitest";
import { assembleGls, coverageStart, type AssembleInput } from "./glAssemble";

// Build a GL fixture: monthly nets for one account "X" at the given months.
function gl(uploadedAt: string, maxPeriod: number, monthsX: Record<number, number>, beginningX?: number): AssembleInput {
  const nets = new Array(12).fill(0);
  for (const [m, v] of Object.entries(monthsX)) nets[Number(m) - 1] = v;
  return {
    uploadedAt,
    maxPeriodInFile: maxPeriod,
    monthly: { X: nets },
    beginning: beginningX != null ? { X: beginningX } : undefined,
    ytdTotal: { X: beginningX != null ? beginningX + Object.values(monthsX).reduce((a, b) => a + b, 0) : 0 },
  };
}

describe("glAssemble", () => {
  it("infers coverage start from the first month with activity", () => {
    expect(coverageStart(gl("t", 2, { 1: 10, 2: 20 }))).toBe(1); // YTD-Feb
    expect(coverageStart(gl("t", 2, { 2: 20 }))).toBe(2);        // Feb-only
    expect(coverageStart(gl("t", 3, { 3: 5 }))).toBe(3);         // Mar-only
  });

  it("month-by-month uploads keep every month (Feb upload doesn't erase Jan)", () => {
    const jan = gl("2026-02-01T00:00:00Z", 1, { 1: 100 }, 1000);
    const feb = gl("2026-03-01T00:00:00Z", 2, { 2: 200 }, 1100); // Feb-only, newer
    const m = assembleGls([jan, feb])!;
    expect(m.monthly.X[0]).toBe(100); // January preserved
    expect(m.monthly.X[1]).toBe(200); // February present
    expect(m.maxPeriodInFile).toBe(2);
    // Beginning comes from the earliest-covering file (the year opening).
    expect(m.beginning?.X).toBe(1000);
  });

  it("a cumulative YTD upload supplies all its months", () => {
    const ytd = gl("2026-03-01T00:00:00Z", 2, { 1: 100, 2: 200 }, 1000);
    const m = assembleGls([ytd])!;
    expect(m.monthly.X).toEqual([100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(m.maxPeriodInFile).toBe(2);
  });

  it("newer upload wins for an overlapping month", () => {
    const v1 = gl("2026-03-01T00:00:00Z", 1, { 1: 100 }, 1000);
    const v2 = gl("2026-03-02T00:00:00Z", 1, { 1: 150 }, 1000); // correction, newer
    expect(assembleGls([v1, v2])!.monthly.X[0]).toBe(150);
  });

  it("returns null for no GLs", () => {
    expect(assembleGls([])).toBeNull();
  });
});
