import { describe, it, expect } from "vitest";
import { retailRecovery, officeRecovery, retailLeaseUp, monthsBetween, totalRecoveries } from "./recoveryMath";

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
const flat = { cam: 1, ins: 1, ret: 1 };

describe("retailRecovery", () => {
  it("keeps the tenant's share and moves with each pool", () => {
    const r = retailRecovery({ unitRef: "2300-1", name: "A", sqft: 1000, camDue: 12000, insDue: 1200, retDue: 6000 }, { cam: 1.05, ins: 1.2, ret: 1.03 });
    expect(r.camYear).toBe(12600);
    expect(r.insYear).toBe(1440);
    expect(r.retYear).toBe(6180);
    expect(sum(r.cam)).toBe(12600);
  });

  it("a capped tenant grows no faster than its cap", () => {
    const r = retailRecovery({ unitRef: "2300-1", name: "A", sqft: 1000, camDue: 10000, insDue: 0, retDue: 0, capped: true, capGrowthPct: 4 }, { cam: 1.10, ins: 1, ret: 1 });
    expect(r.camYear).toBe(10400);
  });

  it("a vacate stops the billing after the term's month", () => {
    const r = retailRecovery({ unitRef: "2300-1", name: "A", sqft: 1000, camDue: 12000, insDue: 0, retDue: 0 }, flat, monthsBetween(1, 6));
    expect(r.cam.slice(0, 6)).toEqual(new Array(6).fill(1000));
    expect(r.cam.slice(6)).toEqual(new Array(6).fill(0));
  });
});

describe("officeRecovery — the increase over the base year", () => {
  const t = { unitRef: "40A0-1", name: "B", sqft: 2000, proRataPct: 10, opexBaseTotal: 90000, opexActualTotal: 100000, retBase: 40000, retActual: 50000 };

  it("recomputes the increase on the budget pool, not last year's bill × the pool change", () => {
    // Pool +5%: 105,000 − 90,000 = 15,000 × 10% = 1,500 — last year's 1,000
    // grew 50%, which a straight ×1.05 would have missed.
    const r = officeRecovery(t, { cam: 1.05, ins: 1, ret: 1 });
    expect(r.camYear).toBe(1500);
    expect(r.retYear).toBe(1000);
    expect(r.insYear).toBe(0);
  });

  it("never bills below zero when the pool falls under the base", () => {
    expect(officeRecovery(t, { cam: 0.8, ins: 1, ret: 1 }).camYear).toBe(0);
  });

  it("a no-base-stop (NNN) tenant pays its share of the whole pool", () => {
    expect(officeRecovery({ ...t, noBaseStop: true }, flat).camYear).toBe(10000);
  });
});

describe("retailLeaseUp", () => {
  it("pays its SF share of each pool from its start month", () => {
    const r = retailLeaseUp("2300-9", 1000, 7, { cam: 120000, ins: 12000, ret: 60000 }, { cam: 10000, ins: 10000, ret: 10000 });
    expect(r.camYear).toBe(12000);
    expect(r.cam.slice(0, 6)).toEqual(new Array(6).fill(0));
    expect(r.cam[6]).toBe(1000);
    expect(r.leaseUp).toBe(true);
  });
});

describe("totalRecoveries", () => {
  it("adds tenants month by month", () => {
    const a = retailRecovery({ unitRef: "1", name: "A", sqft: 1, camDue: 1200, insDue: 0, retDue: 0 }, flat);
    const b = retailRecovery({ unitRef: "2", name: "B", sqft: 1, camDue: 2400, insDue: 0, retDue: 0 }, flat, monthsBetween(1, 3));
    const t = totalRecoveries([a, b]);
    expect(t.cam[0]).toBe(300);
    expect(t.cam[3]).toBe(100);
  });
});
