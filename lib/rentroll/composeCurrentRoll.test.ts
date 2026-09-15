import { describe, it, expect } from "vitest";
import { composeCurrentRoll } from "./current";

// A minimal snapshot: report month + a property per code, each with one unit.
const snap = (reportTo: string, codes: string[]) => ({
  reportTo,
  properties: codes.map((c) => ({
    propertyCode: c,
    totalSqft: 100,
    occupiedSqft: 100,
    vacantSqft: 0,
    units: [{ unitRef: `${c}-1`, occupantName: `Tenant ${c}`, isVacant: false, sqft: 100 }],
  })),
});

describe("composeCurrentRoll", () => {
  it("carries forward properties a later partial import omitted", () => {
    const aug = snap("8/31/2026", ["3610", "4500"]); // office + retail
    const sep = snap("9/30/2026", ["3610"]);          // office-only import
    const composed = composeCurrentRoll([aug, sep])!;
    expect(composed.properties.map((p: any) => p.propertyCode).sort()).toEqual(["3610", "4500"]);
    // retail carried forward from August
    const retail = composed.properties.find((p: any) => p.propertyCode === "4500");
    expect(retail.units[0].occupantName).toBe("Tenant 4500");
  });

  it("uses the newest version of a property present in multiple snapshots", () => {
    const aug = snap("8/31/2026", ["3610"]);
    const sep = snap("9/30/2026", ["3610"]);
    sep.properties[0].units[0].occupantName = "New Office Tenant";
    const composed = composeCurrentRoll([aug, sep])!;
    expect(composed.properties.find((p: any) => p.propertyCode === "3610").units[0].occupantName)
      .toBe("New Office Tenant");
  });

  it("for a full import equals the latest snapshot's property set", () => {
    const aug = snap("8/31/2026", ["3610", "4500"]);
    const sep = snap("9/30/2026", ["3610", "4500"]);
    const composed = composeCurrentRoll([aug, sep])!;
    expect(composed.properties.map((p: any) => p.propertyCode)).toEqual(["3610", "4500"]);
  });

  it("returns null for empty history", () => {
    expect(composeCurrentRoll([])).toBeNull();
  });

  it("ignores stray non-roll objects with no properties", () => {
    const aug = snap("8/31/2026", ["3610", "4500"]);
    const stray = { reportTo: "9/30/2026" } as any; // no properties array
    const composed = composeCurrentRoll([aug, stray])!;
    expect(composed.properties.map((p: any) => p.propertyCode).sort()).toEqual(["3610", "4500"]);
  });
});
