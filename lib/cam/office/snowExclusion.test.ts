// Snow base-year exclusion: the Snow Removal line's base cost is zeroed (or
// prorated toward zero in the effective year), so the tenant recovers its full
// pro-rata share of current-year snow. Every other line keeps its base year.

import { describe, it, expect } from "vitest";
import { reconcileTenant, snowExclusionFraction } from "./compute";
import type { ReconScheduleLine } from "./types";
import { POOL_4070_WORKBOOK, TENANTS_4070_2025 } from "./seed/4070";

const YEAR = 2025;
const r2 = (n: number) => Math.round(n * 100) / 100;
// A normal base-year tenant (base 2022) at 4070.
const base = () => ({ ...TENANTS_4070_2025.find((t) => t.unitRef === "4070-103")! });
const snowOf = (lines: ReconScheduleLine[]) => lines.find((l) => /^6370/.test(l.glAccount))!;

describe("snowExclusionFraction", () => {
  it("is 0 before, prorates in-year by month, and is 1 after", () => {
    const ex = { effectiveMonth: 5, effectiveYear: 2026 };
    expect(snowExclusionFraction(ex, 2025)).toBe(0);            // before → no change
    expect(snowExclusionFraction(ex, 2026)).toBe((13 - 5) / 12); // May → Dec = 8/12
    expect(snowExclusionFraction(ex, 2027)).toBe(1);            // after → full
    expect(snowExclusionFraction(null, 2027)).toBe(0);
    expect(snowExclusionFraction({ effectiveMonth: 1, effectiveYear: 2026 }, 2026)).toBe(1); // Jan = full
  });
});

describe("snow base-year exclusion in reconcileTenant", () => {
  const plain = reconcileTenant(POOL_4070_WORKBOOK, base(), YEAR);
  const snowPlain = snowOf(plain.opexLines);

  it("full exclusion zeroes the snow base cost and lifts recovery by share×baseSnow", () => {
    const t = { ...base(), snowExclusion: { effectiveMonth: 3, effectiveYear: 2024 } }; // before 2025 → full
    const r = reconcileTenant(POOL_4070_WORKBOOK, t, YEAR);
    const snow = snowOf(r.opexLines);
    expect(snow.baseCost).toBe(0);
    expect(r2(snow.netIncrease)).toBe(r2(snow.actual)); // full current-year snow recovers
    // Only the snow line changed: net increase rises by exactly the snow base cost
    // that was floored away (since actual ≥ base here).
    expect(r2(r.opexNetIncrease - plain.opexNetIncrease)).toBe(r2(snowPlain.baseCost));
    expect(r.snowBaseExcluded?.fraction).toBe(1);
    // Recovery goes up (more snow recovered), never down.
    expect(r.opexAmountDue).toBeGreaterThan(plain.opexAmountDue);
  });

  it("prorates the base cost by month in the effective year", () => {
    const t = { ...base(), snowExclusion: { effectiveMonth: 7, effectiveYear: 2025 } }; // Jul → 6/12
    const r = reconcileTenant(POOL_4070_WORKBOOK, t, YEAR);
    const snow = snowOf(r.opexLines);
    expect(r2(snow.baseCost)).toBe(r2(snowPlain.baseCost * 0.5));
    expect(r.snowBaseExcluded?.fraction).toBe(0.5);
  });

  it("does nothing before the effective year", () => {
    const t = { ...base(), snowExclusion: { effectiveMonth: 1, effectiveYear: 2030 } };
    const r = reconcileTenant(POOL_4070_WORKBOOK, t, YEAR);
    expect(snowOf(r.opexLines).baseCost).toBe(snowPlain.baseCost);
    expect(r.snowBaseExcluded).toBeUndefined();
    expect(r2(r.opexAmountDue)).toBe(r2(plain.opexAmountDue));
  });

  it("leaves every non-snow line's base cost untouched", () => {
    const t = { ...base(), snowExclusion: { effectiveMonth: 1, effectiveYear: 2024 } };
    const r = reconcileTenant(POOL_4070_WORKBOOK, t, YEAR);
    for (const l of r.opexLines) {
      if (/^6370/.test(l.glAccount)) continue;
      const was = plain.opexLines.find((x) => x.glAccount === l.glAccount)!;
      expect(l.baseCost).toBe(was.baseCost);
    }
  });
});
