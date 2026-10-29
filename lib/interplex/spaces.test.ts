import { describe, expect, it } from "vitest";
import { DESIGN_TOTAL_SF, floorOf, floorplanPath, sfHeadline, withFloorplans, spacesFromRoll, totalSfFromRoll } from "./spaces";

const u = (unitRef: string, sqft: number, occupantName = "") => ({ unitRef, sqft, occupantName, isVacant: !occupantName });

describe("Neshaminy Interplex Business Center availability follows the rent roll", () => {
  it("lists the vacant suites of the park's buildings, smallest first", () => {
    const spaces = spacesFromRoll([
      { propertyCode: "4080", units: [u("4080-600", 20847), u("4080-130", 2447), u("4080-400", 9000, "LIK Management")] },
      { propertyCode: "3620", units: [u("3620-120", 2587)] },
      { propertyCode: "40B0", units: [u("40B0-1", 1500)] },
    ]);
    expect(spaces.map((s) => [s.bldg, s.suite, s.sf, s.floor])).toEqual([
      ["B", "Suite 1", 1500, undefined],
      ["8", "Suite 130", 2447, "1st"],
      ["2", "Suite 120", 2587, "1st"],
      ["8", "Suite 600", 20847, "6th"],
    ].sort((a, b) => (a[2] as number) - (b[2] as number)));
  });
  it("never offers shared space, an amenity, a unit with no SF, or The Office Works", () => {
    expect(spacesFromRoll([
      { propertyCode: "4080", units: [u("4080-CONF", 1200), { ...u("4080-105", 800), amenity: { kind: "training" } }, u("4080-110", 0)] },
      { propertyCode: "4900", units: [u("4900-5008", 142)] },
    ])).toEqual([]);
  });
  it("reads floors only from three-digit suites", () => {
    expect(floorOf("210")).toBe("2nd");
    expect(floorOf("A")).toBeUndefined();
    expect(floorOf("5019")).toBeUndefined();
  });
  it("totals the park's SF off the roll, else the design's figure", () => {
    expect(totalSfFromRoll([{ propertyCode: "3610", totalSqft: 41821, units: [] }, { propertyCode: "9510", totalSqft: 9999, units: [] }])).toBe(41821);
    expect(totalSfFromRoll([])).toBe(DESIGN_TOTAL_SF);
  });
  it("shows the park's SF rounded down to 25K with a plus", () => {
    expect(sfHeadline(536950)).toBe("525K+");
    expect(sfHeadline(379315)).toBe("375K+");
  });
  it("carries the unit page's floor plan through the public route, a PDF as a link", () => {
    const spaces = spacesFromRoll([{ propertyCode: "4050", units: [u("4050-101", 9434), u("4050-119", 1850)] }]);
    const plans = new Map([["4050-101", { contentType: "application/pdf" }]]);
    const out = withFloorplans(spaces, plans);
    expect(out.find((s) => s.unit === "4050-101")).toMatchObject({ floorplan: floorplanPath("4050-101"), floorplanPdf: true });
    expect(out.find((s) => s.unit === "4050-119")?.floorplan).toBeUndefined();
  });
});
