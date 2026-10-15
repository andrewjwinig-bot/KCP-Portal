import { describe, it, expect } from "vitest";
import { lineInsight } from "./lineInsight";
import type { LineHistory, LineYear } from "./lineHistory";

const yr = (year: number, actual: number | null, budget: number | null, months?: number[]): LineYear => ({
  year, actual, budget,
  months: months ?? (actual != null ? Array(12).fill(actual / 12) : null),
  variance: actual != null && budget != null ? actual - budget : null,
  monthsCovered: actual != null ? 12 : 0,
  budgetFallback: false,
});

const hist = (years: LineYear[]): LineHistory => ({
  propertyCode: "9510", label: "Test", mask: "6000-*", years,
  averageActual: null, completeYears: years.filter((y) => y.actual != null).length,
});

describe("what the history says to budget", () => {
  it("declines to guess from one year", () => {
    const i = lineInsight(hist([yr(2026, 10_000, 10_000)]));
    expect(i.shape).toBe("unknown");
    expect(i.suggestion).toBeNull();
    expect(i.notes[0]).toContain("Only one complete year");
  });

  it("a STEADY contract anchors on last year", () => {
    const i = lineInsight(hist([yr(2023, 24_000, 24_000), yr(2024, 24_500, 24_500), yr(2025, 25_000, 25_000), yr(2026, 25_200, 25_000)]));
    expect(i.shape).toBe("steady");
    expect(i.suggestion!.amount).toBe(25_200);
    expect(i.suggestion!.basis).toContain("last year");
  });

  it("a TRENDING line extends its own rate, not a flat 3%", () => {
    // 8% a year, steadily. Budgeting +3% would under-fund it every year.
    const i = lineInsight(hist([yr(2023, 20_000, 20_000), yr(2024, 21_600, 20_600), yr(2025, 23_328, 22_000), yr(2026, 25_194, 23_500)]));
    expect(i.shape).toBe("trending");
    expect(i.trendPct).toBeCloseTo(8, 0);
    expect(i.suggestion!.amount).toBeGreaterThan(27_000);
    expect(i.suggestion!.basis).toContain("trend");
  });

  it("a LUMPY line anchors on the average — last year is the worst guide", () => {
    // Parking lot maintenance: nothing, nothing, then a repaving year.
    const i = lineInsight(hist([yr(2023, 2_000, 5_000), yr(2024, 1_200, 5_000), yr(2025, 3_400, 5_000), yr(2026, 28_000, 5_000)]));
    expect(i.shape).toBe("lumpy");
    expect(i.suggestion!.basis).toContain("average");
    // And well below last year's repaving.
    expect(i.suggestion!.amount).toBeLessThan(10_000);
  });

  it("names the OUTLIER and keeps it out of the anchor", () => {
    const i = lineInsight(hist([yr(2023, 2_000, 5_000), yr(2024, 1_200, 5_000), yr(2025, 3_400, 5_000), yr(2026, 28_000, 5_000)]));
    expect(i.outlier?.year).toBe(2026);
    expect(i.suggestion!.basis).toContain("excluding 2026");
    expect(i.notes.join(" ")).toContain("2026 ran");
  });

  it("says when we have been budgeting a line badly, and which way", () => {
    // Snow: budgeted ~11k, spent ~15k, three years running.
    const i = lineInsight(hist([yr(2024, 15_000, 11_000), yr(2025, 14_400, 11_000), yr(2026, 15_600, 11_500)]));
    expect(i.budgetBiasPct).toBeGreaterThan(30);
    expect(i.notes.join(" ")).toContain("Budgeted low");
  });

  it("catches the other direction too", () => {
    const i = lineInsight(hist([yr(2024, 7_000, 12_000), yr(2025, 7_400, 12_000), yr(2026, 7_200, 12_000)]));
    expect(i.budgetBiasPct).toBeLessThan(-30);
    expect(i.notes.join(" ")).toContain("Budgeted high");
  });

  it("finds the months a seasonal line actually posts in", () => {
    // Snow: Jan, Feb, Mar, Nov, Dec.
    const snow = [8000, 6000, 3000, 0, 0, 0, 0, 0, 0, 0, 2000, 5000];
    const i = lineInsight(hist([yr(2025, 24_000, 20_000, snow), yr(2026, 24_000, 20_000, snow)]));
    expect(i.activeMonths).toEqual([1, 2, 3, 11, 12]);
    expect(i.notes.join(" ")).toContain("spread it over those");
  });

  it("does not claim seasonality for a line that posts all year", () => {
    const even = Array(12).fill(1000);
    const i = lineInsight(hist([yr(2025, 12_000, 12_000, even), yr(2026, 12_000, 12_000, even)]));
    expect(i.activeMonths).toHaveLength(12);
    expect(i.notes.join(" ")).not.toContain("spread it over those");
  });

  it("ignores a PART year, which would read as a collapse", () => {
    const partial = { ...yr(2026, 6_000, 24_000), monthsCovered: 6 };
    const i = lineInsight(hist([yr(2024, 24_000, 24_000), yr(2025, 24_400, 24_000), partial]));
    // The suggestion anchors on 2025, the last COMPLETE year — not on six
    // months of 2026 read as a full year.
    expect(i.suggestion!.amount).toBe(24_400);
  });
});
