import { describe, expect, it } from "vitest";
import { buildingFigures, occBand, occupancyOf } from "./campusMath";
import { CAMPUS } from "./plans";

describe("campus figures", () => {
  const today = new Date("2026-11-30T00:00:00Z");
  it("leased SF, tenants, vacancies and WALT off the roll — amenities left out", () => {
    const f = buildingFigures([
      { unitRef: "4060-100", occupantName: "A Co", isVacant: false, sqft: 1000, annualRent: 20000, leaseTo: "2028-11-30" },
      { unitRef: "4060-101", occupantName: "A Co", isVacant: false, sqft: 1000, annualRent: 20000, leaseTo: "2027-11-30" },
      { unitRef: "4060-102", occupantName: "", isVacant: true, sqft: 2000 },
      { unitRef: "4060-217", occupantName: "Conference Room", isVacant: false, sqft: 500, amenity: { kind: "room" } },
    ], today);
    expect(f).toMatchObject({ sf: 4000, leasedSf: 2000, tenants: 1, vacantSuites: 1, baseRentAnnual: 40000, avgRentPsf: 20 });
    expect(f.walt).toBeCloseTo(1.5, 1);
    expect(occupancyOf(f)).toBe(0.5);
    expect(occBand(f).key).toBe("low");
  });
  it("every campus building is one of ours", () => {
    expect(CAMPUS.buildings.map((b) => b.code).sort()).toEqual(["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
  });
});
