import { describe, it, expect } from "vitest";
import { SHOPPING_CENTER_CODES, occupancyOf } from "./portfolioGroups";

describe("portfolio occupancy — one rule for the dashboard and the Monthly Review", () => {
  it("9000 Butler & Main is a shopping centre", () => {
    expect(SHOPPING_CENTER_CODES.has("9000")).toBe(true);
  });
  it("a common room counts as occupied, as the rent roll totals it", () => {
    const o = occupancyOf([
      { sqft: 1000, isVacant: false },
      { sqft: 500, isVacant: true },
      { sqft: 300, isVacant: false, amenity: { label: "Training Room" } },
      { sqft: 200, isVacant: true, amenity: { label: "Conference Room" } },
    ]);
    expect(o).toEqual({ total: 2000, occupied: 1500, vacant: 500 });
  });
});
