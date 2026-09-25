import { describe, expect, it } from "vitest";
import { historyComments } from "./historyComments";

const m = (v: number) => new Array(12).fill(v);
const year = (y: number, months: number[] | null, covered = 12, budgetMonths: number[] | null = null) =>
  ({ year: y, months, actual: months ? months.reduce((a, b) => a + b, 0) : null, budget: budgetMonths ? budgetMonths.reduce((a, b) => a + b, 0) : null, budgetMonths, variance: null, monthsCovered: covered, budgetFallback: false });
const hist = (years: any[]) => ({ propertyCode: "1100", label: "X", mask: "6*", years, averageActual: null, completeYears: 0 });

describe("historyComments", () => {
  it("says where the draft sits against the reprojection and what history supports", () => {
    const h = hist([year(2025, m(1000)), year(2026, [...m(1000).slice(0, 8), 0, 0, 0, 0], 8, m(1000))]);
    const c = historyComments(h, { notes: [], suggestion: { amount: 15000, basis: "3-year average" }, activeMonths: [] } as any, 2027, m(1100));
    expect(c).toContain("The 2027 budget is $1,200 (10%) above the 2026 reprojection.");
    expect(c.some((x) => x.startsWith("History supports about $15,000"))).toBe(true);
  });
  it("names a month that stood out this year", () => {
    const h = hist([year(2026, [500, 500, 4000, 500, 500, 0, 0, 0, 0, 0, 0, 0], 5, m(500))]);
    const c = historyComments(h, { notes: [], activeMonths: [] } as any, 2027, m(520));
    expect(c.some((x) => x.startsWith("Mar 2026 ran $4,000"))).toBe(true);
  });
  it("suggests the months a seasonal line actually posts in", () => {
    const c = historyComments(hist([]), { notes: ["Posts in 3 months of the year — spread it over those, not evenly."], activeMonths: [1, 2, 12] } as any, 2027, m(1000));
    expect(c).toEqual(["It has only posted in Jan, Feb, Dec — spread the 2027 budget over those months rather than evenly."]);
  });
  it("stays quiet on small gaps", () => {
    const h = hist([year(2026, m(1000), 12, m(1000))]);
    expect(historyComments(h, { notes: [], activeMonths: [] } as any, 2027, m(1010))).toEqual([]);
  });
});
