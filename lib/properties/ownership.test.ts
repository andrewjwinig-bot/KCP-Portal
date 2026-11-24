import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP, getOwnersForProperty } from "./ownership";

/**
 * Best display ownership % for a single owner — mirrors what the UI shows.
 * For wholly-owned rows we have ownerPct; for K-1 investors we have profit
 * (loss / capital are identical in source data so any of the three works).
 */
function ownerPctFor(o: {
  profitPct?: number;
  ownerPct?: number;
  capitalPct?: number;
  lossPct?: number;
}): number {
  return o.profitPct ?? o.ownerPct ?? o.capitalPct ?? o.lossPct ?? 0;
}

/**
 * Tolerance for the per-property sum check. Source schedules round each
 * owner's share to four decimal places, so the worst-case rounding error
 * across N owners is N * 0.00005. We use 0.001 (10 bps) which comfortably
 * covers properties with up to ~20 owners.
 */
const TOLERANCE = 0.001;

describe("PROPERTY_OWNERSHIP", () => {
  it("has unique property codes", () => {
    const seen = new Set<string>();
    for (const p of PROPERTY_OWNERSHIP) {
      expect(seen.has(p.propertyCode), `duplicate propertyCode ${p.propertyCode}`).toBe(false);
      seen.add(p.propertyCode);
    }
  });

  it("has unique owner IDs across the whole dataset", () => {
    const seen = new Set<string>();
    for (const p of PROPERTY_OWNERSHIP) {
      for (const o of p.owners) {
        expect(seen.has(o.id), `duplicate owner id ${o.id} (on ${p.propertyCode})`).toBe(false);
        seen.add(o.id);
      }
    }
  });

  for (const p of PROPERTY_OWNERSHIP) {
    it(`property ${p.propertyCode}: owner shares sum to ~100%`, () => {
      const total = p.owners.reduce((s, o) => s + ownerPctFor(o), 0);
      if (total === 0) {
        // Property exists but no shares have been entered yet (placeholder
        // rows). Warn so it's visible, but don't fail the suite.
        console.warn(`  [ownership] ${p.propertyCode}: no ownership %s entered yet (skipping sum check)`);
        return;
      }
      expect(
        Math.abs(total - 1),
        `${p.propertyCode} sums to ${(total * 100).toFixed(4)}%`,
      ).toBeLessThan(TOLERANCE);
    });
  }

  it("getOwnersForProperty returns the same list as the entry", () => {
    for (const p of PROPERTY_OWNERSHIP) {
      expect(getOwnersForProperty(p.propertyCode)).toEqual(p.owners);
    }
    expect(getOwnersForProperty("NOPE_DOES_NOT_EXIST")).toEqual([]);
  });
});
