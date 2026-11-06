import { describe, expect, it } from "vitest";
import { rentRollBreakdown } from "./rentRollBreakdown";
import { calculate } from "./calculate";

const u = (sqft: number, baseRent: number, vacant = false, extra = 0) =>
  ({ sqft, baseRent, isVacant: vacant, opexMonth: extra, reTaxMonth: 0, otherMonth: 0 }) as any;
const prop = (propertyCode: string, units: any[]) => ({ propertyCode, units }) as any;

describe("rent roll breakdown", () => {
  it("occupancy and rent per SF by property type", () => {
    const r = rentRollBreakdown([
      prop("4060", [u(1000, 2000), u(1000, 0, true)]),          // office: 50% occ, $24/SF
      prop("4500", [u(2000, 3000, false, 500)]),                 // retail: 100%, $18/SF base, $21 gross
      prop("2010", [u(500, 1000)]),                              // management: left out
    ], { groupBy: "property_type" });
    const office = r.groups.find((g) => g.group === "Office")!;
    const retail = r.groups.find((g) => g.group === "Retail")!;
    expect(office.occupancyPct).toBe(50);
    expect(office.baseRentPerSf).toBe(24);
    expect(retail.baseRentPerSf).toBe(18);
    expect(retail.grossRentPerSf).toBe(21);
    expect(r.total.totalSqft).toBe(4000);
    expect(r.total.occupancyPct).toBe(75);
    expect(r.groups.some((g) => g.group === "Management company")).toBe(false);
  });
  it("an amenity counts as occupied but not in rent per SF", () => {
    const r = rentRollBreakdown([prop("4060", [u(1000, 2000), { ...u(500, 0), amenity: { label: "Gym" } }])], { groupBy: "property_type" });
    expect(r.groups[0].occupancyPct).toBe(100);
    expect(r.groups[0].baseRentPerSf).toBe(24);
  });
});

describe("calculator", () => {
  it("does the arithmetic", () => {
    expect(calculate("sum", [1, 2, 3.5])).toEqual({ result: 6.5 });
    expect(calculate("percent", [25, 200])).toEqual({ resultPct: 12.5 });
    expect(calculate("percent_change", [100, 90])).toEqual({ resultPct: -10 });
    expect(calculate("difference", [24, 18])).toEqual({ result: 6 });
    expect((calculate("share", [75, 25], ["A", "B"]) as any).shares[0].sharePct).toBe(75);
    expect(calculate("ratio", [1, 0])).toHaveProperty("error");
  });
});
