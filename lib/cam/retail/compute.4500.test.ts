// 4500 (Gray's Ferry) retail reconciliation — ties to the workbook CAM tab's
// per-tenant Net Due columns. Exercises the building's many quirks: per-tenant
// CAM line exclusions + admin-fee exclusions (McDonald's, Fresh Grocer), the
// McDonald's-outparcel INS carve-out, Victra's partial-year occupancy + reduced
// RET GLA, USPS RET-only, Clear Channel's flat billboard RET, and PLCB gross.

import { describe, it, expect } from "vitest";
import { reconcileRetailBuilding } from "./compute";
import { POOL_4500, TENANTS_4500_2025 } from "./seed/4500";

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

describe("4500 retail reconciliation — connected from app data", () => {
  const result = reconcileRetailBuilding(POOL_4500, TENANTS_4500_2025);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // [CAM Net (P), INS Net (U), RET Net (AA)] from the workbook tenant table.
  const expected: Record<string, [number, number, number]> = {
    "4500-2851": [-5612.14, 0, 7074.27],       // McDonald's — pad, no INS, excl Bldg Maint, 15% admin
    "4500-2891": [-4738.32, 17.84, -38.52],    // JP Morgan
    "4500-2895": [-3051.70, 7.46, -28.04],     // Nail Parlor
    "4500-2897": [3782.74, 3.22, 178.18],      // Victra — 69.3% occ, reduced RET GLA
    "4500-2899": [-3051.70, 7.46, -28.04],     // Curl & Care
    "4500-3001": [-6091.39, 26.91, -44.09],    // Hilti
    "4500-3021": [55346.45, 1136.35, 1045.82], // Fresh Grocer — CAM PRS stipulated 67.96%, 5% admin, excl Bldg Maint
    "4500-3000": [0, 0, 3017],                 // Clear Channel — flat billboard RET
    "4500-3005": [0, 0, 3079.96],              // USPS — RET only
    "4500-3009": [0, 0, 0],                    // PLCB — gross
  };

  for (const [unitRef, [cam, ins, ret]] of Object.entries(expected)) {
    it(`${unitRef} ties to the workbook (±$2)`, () => {
      const r = byUnit[unitRef];
      expect(near(r.camBalance, cam)).toBe(true);
      expect(near(r.insBalance, ins)).toBe(true);
      expect(near(r.retBalance, ret)).toBe(true);
    });
  }

  it("McDonald's pad: no INS, excludes Building Maintenance, 15% admin", () => {
    const m = byUnit["4500-2851"];
    expect(m.insDue).toBe(0);
    expect(m.adminFeePct).toBe(15);
    expect(near(m.camPoolEffective, 410608.58, 2)).toBe(true); // full less Bldg Maint
  });

  it("Victra is prorated to 69.3% occupancy on all three categories", () => {
    expect(byUnit["4500-2897"].occPct).toBe(0.6932);
  });

  it("Clear Channel bills a flat $3,017 RET (own billboard parcel)", () => {
    expect(byUnit["4500-3000"].flatRet).toBe(3017);
    expect(byUnit["4500-3000"].retDue).toBe(3017);
    expect(byUnit["4500-3000"].camDue).toBe(0);
  });

  it("building balance totals tie to the workbook (±$5)", () => {
    expect(near(result.totals.camBalance, 36583.96, 5)).toBe(true);
    expect(near(result.totals.insBalance, 1199.24, 5)).toBe(true);
  });
});
