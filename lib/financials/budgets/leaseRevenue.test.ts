import { describe, it, expect, vi } from "vitest";

const resolveCurrentRentroll = vi.fn();
vi.mock("@/lib/rentroll/current", () => ({ resolveCurrentRentroll: () => resolveCurrentRentroll() }));

import { projectLeaseRevenue } from "./leaseRevenue";

const roll = (units: any[]) => ({ properties: [{ propertyCode: "1100", units }] });
const u = (unitRef: string, over: any = {}) => ({ unitRef, occupantName: "T", isVacant: false, baseRent: 1000, sqft: 500, leaseTo: null, ...over });

describe("projectLeaseRevenue", () => {
  it("holds in-place rents flat across all 12 months", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000 }), u("1100-2", { baseRent: 500 })]));
    const p = await projectLeaseRevenue(["1100"], 2027);
    expect(p.hasData).toBe(true);
    expect(p.inPlaceUnits).toBe(2);
    expect(p.rentalMonthly.every((m) => m === 1500)).toBe(true);
    expect(p.rentalTotal).toBe(18000);
  });

  it("flags leases expiring in the budget year and holdovers, and vacant units", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([
      u("1100-1", { occupantName: "Acme", baseRent: 2000, leaseTo: "6/30/2027" }), // expiring in budget year
      u("1100-2", { occupantName: "Bygone", baseRent: 800, leaseTo: "3/31/2025" }), // already expired → holdover
      u("1100-3", { occupantName: "Stable", baseRent: 1000, leaseTo: "12/31/2030" }), // fine
      u("1100-9", { isVacant: true, occupantName: "", baseRent: 0, sqft: 900 }),
      { unitRef: "1100-A", amenity: { label: "Conf" }, isVacant: false, occupantName: "Conf", baseRent: 0, sqft: 0 }, // amenity ignored
    ]));
    const p = await projectLeaseRevenue(["1100"], 2027);
    expect(p.inPlaceUnits).toBe(3); // amenity + vacant excluded
    expect(p.expiring.map((e) => e.unitRef).sort()).toEqual(["1100-1", "1100-2"]);
    expect(p.expiring.find((e) => e.unitRef === "1100-2")!.holdover).toBe(true);
    expect(p.expiring.find((e) => e.unitRef === "1100-1")!.holdover).toBe(false);
    expect(p.vacant.map((v) => v.unitRef)).toEqual(["1100-9"]);
  });

  it("returns hasData=false when no roll or no matching property", async () => {
    resolveCurrentRentroll.mockResolvedValue(null);
    expect((await projectLeaseRevenue(["1100"], 2027)).hasData).toBe(false);
  });

  it("applies a vacate assumption — pays through the vacate month, then $0", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000, leaseTo: "6/30/2027" })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "vacate", startMonth: 6 } });
    // Jan–Jun paid, Jul–Dec zero.
    expect(p.rentalMonthly).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 0, 0, 0, 0, 0, 0]);
    expect(p.rentalTotal).toBe(6000);
    expect(p.assumptionsApplied).toBe(1);
  });

  it("applies a renewal step-up from a start month", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000, leaseTo: "6/30/2027" })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "renew", monthlyRent: 1200, startMonth: 7 } });
    expect(p.rentalMonthly).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1200, 1200, 1200, 1200, 1200, 1200]);
  });

  it("applies a lease-up on a vacant space from a start month", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-9", { isVacant: true, occupantName: "", baseRent: 0, sqft: 900 })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-9": { unitRef: "1100-9", kind: "leaseup", monthlyRent: 3000, startMonth: 4 } });
    expect(p.rentalMonthly).toEqual([0, 0, 0, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000]);
    expect(p.rentalTotal).toBe(27000);
  });
});
