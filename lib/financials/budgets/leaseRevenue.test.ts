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

  it("BACKS OUT a lease in place — no rent from the chosen month (a tenant who will not pay)", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([
      u("1100-1", { occupantName: "Rite Aid", baseRent: 5000, leaseTo: "12/31/2031" }),
      u("1100-2", { occupantName: "Stable", baseRent: 1000, leaseTo: "12/31/2031" }),
    ]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "stop", startMonth: 3 } });
    expect(p.rows.find((r) => r.unitRef === "1100-1")!.months).toEqual([5000, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(p.rentalMonthly).toEqual([6000, 6000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    // Both leases are listed as in place, and the backed-out one carries its call.
    expect(p.contracted.map((c) => c.unitRef)).toEqual(["1100-1", "1100-2"]);
    expect(p.contracted[0].assumption?.kind).toBe("stop");
    expect(p.contracted[0].monthlyRent).toBe(5000);
    expect(p.expiring).toEqual([]);
  });

  it("returns hasData=false when no roll or no matching property", async () => {
    resolveCurrentRentroll.mockResolvedValue(null);
    expect((await projectLeaseRevenue(["1100"], 2027)).hasData).toBe(false);
  });

  it("a vacate pays through the month the term ends — no date to assume", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000, leaseTo: "6/30/2027" })]));
    // A stale startMonth on the saved assumption is ignored: the lease decides.
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "vacate", startMonth: 2 } });
    expect(p.rentalMonthly).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 0, 0, 0, 0, 0, 0]);
    expect(p.rentalTotal).toBe(6000);
    expect(p.assumptionsApplied).toBe(1);
  });

  it("a renewal's new rent starts the day after the term expires", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000, leaseTo: "6/30/2027" })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "renew", monthlyRent: 1200, startMonth: 1 } });
    expect(p.rentalMonthly).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1200, 1200, 1200, 1200, 1200, 1200]);
  });

  it("a lease ending 11/30 renews from 12/1", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000, leaseTo: "11/30/2027" })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "renew", monthlyRent: 1100 } });
    expect(p.rentalMonthly.slice(9)).toEqual([1000, 1000, 1100]);
  });

  it("a holdover renews from January", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-1", { baseRent: 1000, leaseTo: "3/31/2025" })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-1": { unitRef: "1100-1", kind: "renew", monthlyRent: 1100 } });
    expect(p.rentalMonthly.every((m) => m === 1100)).toBe(true);
  });

  it("applies a lease-up on a vacant space from a start month", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([u("1100-9", { isVacant: true, occupantName: "", baseRent: 0, sqft: 900 })]));
    const p = await projectLeaseRevenue(["1100"], 2027, { "1100-9": { unitRef: "1100-9", kind: "leaseup", monthlyRent: 3000, startMonth: 4 } });
    expect(p.rentalMonthly).toEqual([0, 0, 0, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000]);
    expect(p.rentalTotal).toBe(27000);
  });
  it("puts a deal's TI ($/SF × SF) and commission (% of rent × term) in the month its new rent starts", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([
      u("1100-1", { occupantName: "Acme", baseRent: 2000, sqft: 1000, leaseTo: "6/30/2027" }), // renews 7/1
      u("1100-9", { isVacant: true, occupantName: "", baseRent: 0, sqft: 3000 }),
      u("1100-H", { occupantName: "Stays", baseRent: 1000, sqft: 400, leaseTo: "3/31/2026" }),
    ]));
    const p = await projectLeaseRevenue(["1100"], 2027, {
      // 6% of $2,000/mo × 12 × 5 yrs = $7,200
      "1100-1": { unitRef: "1100-1", kind: "renew", tiPsf: 5, lcPct: 6, termYears: 5 },
      // 4% of $5,500/mo × 12 × 3 yrs = $7,920
      "1100-9": { unitRef: "1100-9", kind: "leaseup", startMonth: 4, monthlyRent: 5500, tiPsf: 10, lcPct: 4, termYears: 3 },
      // held at today's rent for a new term: 5% of $1,000 × 12 × 2 yrs = $1,200, from Jan (holdover)
      "1100-H": { unitRef: "1100-H", kind: "hold", tiPsf: 2, lcPct: 5, termYears: 2 },
      // no term → no commission
      "1100-X": { unitRef: "1100-X", kind: "renew", lcPct: 6 },
    });
    expect(p.tiMonthly[6]).toBe(5000);   // July: the renewal
    expect(p.tiMonthly[3]).toBe(30000);  // April: the lease-up
    expect(p.lcMonthly[6]).toBe(7200);
    expect(p.lcMonthly[3]).toBe(7920);
    expect(p.tiMonthly[0]).toBe(800);     // January: the held tenant's TI (2 × 400 sf)
    expect(p.lcMonthly[0]).toBe(1200);
    expect(p.tiMonthly.reduce((a, b) => a + b, 0)).toBe(35800);
    expect(p.expiring.find((e) => e.unitRef === "1100-1")!.sqft).toBe(1000);
  });

  it("runs off the RENT SCHEDULE once imported: contracted months as scheduled, decisions assumed after", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([
      u("1100-1", { occupantName: "Steady", baseRent: 1000, sqft: 1000, leaseTo: "12/31/2030" }),
      u("1100-2", { occupantName: "Ends June", baseRent: 2000, sqft: 800, leaseTo: "6/30/2027" }),
      u("1100-3", { occupantName: "Holdover", baseRent: 500, sqft: 300, leaseTo: "3/31/2026" }),
      u("1100-9", { isVacant: true, occupantName: "", baseRent: 0, sqft: 1500 }),
    ]));
    const ch = (unitRef: string, month: number, amount: number, tenant = "") =>
      ({ propertyCode: "1100", unitRef, tenant, month, chargeCode: "RNT", glAccount: "4230", amount, chargeDate: null });
    const schedule = [
      // A step in April: 1,000 → 1,050 — the rent roll held flat would miss it.
      ...[1, 2, 3].map((m) => ch("1100-1", m, 1000, "Steady")),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ch("1100-1", m, 1050, "Steady")),
      ...[1, 2, 3, 4, 5, 6].map((m) => ch("1100-2", m, 2000, "Ends June")),
    ];
    const p = await projectLeaseRevenue(["1100"], 2027, {
      "1100-2": { unitRef: "1100-2", kind: "renew", monthlyRent: 2100 },
      "1100-9": { unitRef: "1100-9", kind: "leaseup", startMonth: 10, monthlyRent: 3000 },
    }, schedule as any);
    expect(p.fromSchedule).toBe(true);

    const row = (ref: string) => p.rows.find((r) => r.unitRef === ref)!;
    expect(row("1100-1").months[3]).toBe(1050);                 // the scheduled step
    expect(row("1100-1").assumed.some(Boolean)).toBe(false);    // all contracted
    expect(row("1100-2").months.slice(0, 6).every((v) => v === 2000)).toBe(true);
    expect(row("1100-2").months[6]).toBe(2100);                 // renewal from July
    expect(row("1100-2").assumed[5]).toBe(false);
    expect(row("1100-2").assumed[6]).toBe(true);                // speculative
    expect(row("1100-3").status).toBe("holdover");              // no 2027 charges, still a tenant
    expect(row("1100-3").months.every((v) => v === 0)).toBe(true); // nil until decided
    expect(row("1100-9").months[9]).toBe(3000);
    expect(row("1100-9").assumed[9]).toBe(true);

    expect(p.expiring.map((e) => e.unitRef).sort()).toEqual(["1100-2", "1100-3"]);
    expect(p.vacant.map((v) => v.unitRef)).toEqual(["1100-9"]);
    // The rows ARE the rental line.
    for (let m = 0; m < 12; m++) expect(p.rows.reduce((a, r) => a + r.months[m], 0)).toBe(p.rentalMonthly[m]);
  });

  it("a suite NAMED 'Vacant' on the roll is a vacancy, not an expiring tenant", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([
      u("1100-30", { occupantName: "Vacant", isVacant: false, baseRent: 0, sqft: 3025 }),
      u("1100-31", { occupantName: "*** VACANT ***", isVacant: true, baseRent: 0, sqft: 900 }),
      u("1100-1", { occupantName: "Steady", baseRent: 1000, sqft: 1000, leaseTo: "12/31/2030" }),
    ]));
    const schedule = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
      ({ propertyCode: "1100", unitRef: "1100-1", tenant: "Steady", month: m, chargeCode: "RNT", glAccount: "4230", amount: 1000, chargeDate: null }));
    const p = await projectLeaseRevenue(["1100"], 2027, {}, schedule as any);
    expect(p.vacant.map((v) => v.unitRef).sort()).toEqual(["1100-30", "1100-31"]);
    expect(p.expiring).toHaveLength(0);
  });

  it("a lease-up keyed as $/SF projects its rent (15.00/sf × 3,025 sf from April)", async () => {
    resolveCurrentRentroll.mockResolvedValue(roll([
      u("1100-30", { occupantName: "Vacant", isVacant: true, baseRent: 0, sqft: 3025 }),
      u("1100-1", { occupantName: "Steady", baseRent: 1000, sqft: 1000, leaseTo: "12/31/2030" }),
    ]));
    const schedule = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
      ({ propertyCode: "1100", unitRef: "1100-1", tenant: "Steady", month: m, chargeCode: "RNT", glAccount: "4230", amount: 1000, chargeDate: null }));
    const p = await projectLeaseRevenue(["1100"], 2027, {
      "1100-30": { unitRef: "1100-30", kind: "leaseup", startMonth: 4, rentPsf: 15 },   // no monthlyRent
    }, schedule as any);
    const row = p.rows.find((r) => r.unitRef === "1100-30")!;
    expect(row.months[2]).toBe(0);
    expect(Math.round(row.months[3])).toBe(3781);            // 15 × 3,025 ÷ 12
    expect(row.assumed[3]).toBe(true);
    expect(p.rentalMonthly[3]).toBe(1000 + 3781);
  });
});
