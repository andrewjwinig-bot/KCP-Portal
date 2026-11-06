import { describe, it, expect } from "vitest";
import { occupancyTrend, trailingMonths } from "./occupancyTrend";

const prop = (propertyCode: string, units: [number, boolean][]) => ({
  propertyCode,
  totalSqft: units.reduce((s, [sf]) => s + sf, 0),
  units: units.map(([sqft, isVacant]) => ({ sqft, isVacant })),
});
const snap = (reportTo: string, properties: any[]) => ({ reportTo, properties });

describe("occupancyTrend", () => {
  it("lists the trailing months oldest first across a year end", () => {
    expect(trailingMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("carries a property forward from an older snapshot and leaves months before any roll null", () => {
    const snaps = [
      snap("07/31/2026", [prop("A", [[100, false], [100, true]]), prop("B", [[100, false]])]),
      // An office-only import: B is missing, carried forward from July.
      snap("09/30/2026", [prop("A", [[100, false], [100, false]])]),
    ];
    const groups = [{ label: "AB", codes: new Set(["A", "B"]) }];
    const t = occupancyTrend(snaps, "2026-09", 4, groups);
    expect(t.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(t[0].pct.AB).toBeNull();
    expect(t[1].pct.AB).toBeCloseTo(200 / 3);
    expect(t[2].pct.AB).toBeCloseTo(200 / 3); // August carries July
    expect(t[3].pct.AB).toBe(100);
  });
});
