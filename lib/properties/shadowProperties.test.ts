import { describe, it, expect } from "vitest";
import { SHADOW_PROPERTIES, regionAcres, totalAcres, shadowProperty } from "./shadowProperties";
import { PROPERTY_DEFS } from "./data";

describe("shadow properties", () => {
  it("The Korman Co Land ties to its schedule's totals", () => {
    const land = shadowProperty("LAND")!;
    expect(land.regions.map((r) => Math.round(regionAcres(r) * 100) / 100)).toEqual([2.3, 84.67, 55.04, 22.6]);
    expect(totalAcres(land)).toBeCloseTo(164.62, 2);
  });
  it("is never in PROPERTY_DEFS, so no dropdown lists it", () => {
    for (const s of SHADOW_PROPERTIES) expect(PROPERTY_DEFS.some((p) => p.id === s.id)).toBe(false);
  });
});
