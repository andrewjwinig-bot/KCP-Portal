// 7010 (Parkwood Shopping/Office Center) — mixed retail + office. Both parts
// reconcile retail-style; ties to each workbook's per-tenant Net Due columns
// (CAM P, INS U, RET AA). Exercises per-tenant CAM pool overrides (pads),
// varying CAM/INS denominators, partial occupancy, mixed admin, gross leases.

import { describe, it, expect } from "vitest";
import { reconcileRetailBuilding } from "./compute";
import { POOL_7010_RETAIL, TENANTS_7010_RETAIL_2025 } from "./seed/7010-retail";
import { POOL_7010_OFFICE, TENANTS_7010_OFFICE_2025 } from "./seed/7010-office";
import { ALLOCATION_7010 } from "./allocation";

const near = (a: number, b: number, tol = 3) => Math.abs(a - b) <= tol;

describe("7010 retail reconciliation", () => {
  const byUnit = Object.fromEntries(
    reconcileRetailBuilding(POOL_7010_RETAIL, TENANTS_7010_RETAIL_2025).tenants.map((t) => [t.unitRef, t]),
  );
  // [CAM (P), INS (U), RET (AA)] from the retail workbook tenant table.
  const expected: Record<string, [number, number, number]> = {
    "7010-1230A": [414.18, 0, -376.33],     // Wawa — reduced pool, no INS, no admin
    "7010-12315": [4088.02, -103.42, -192.16],
    "7010-12319": [5737.64, -142.39, -278.63],
    "7010-12325": [1825.81, -42.34, -88.27],
    "7010-12327": [6889.67, 164.04, 1068.78], // Forge — 74.5% occ
    "7010-12331": [3063.02, 83.63, -147.12],  // Petroski — INS on reduced GLA
    "7010-12349": [7062.34, 332.74, 5003.33], // North Inc — 67.1% occ
    "7010-12360": [-2544.79, -66.04, -139.77], // Trumark — reduced pool, 15% admin
    "7010-12375": [940.87, 0, -192.16],        // Dunkin — reduced pool, no INS
    "7010-12361": [0, 0, 0],                   // Senator — gross
  };
  for (const [u, [cam, ins, ret]] of Object.entries(expected)) {
    it(`${u} ties (±$3)`, () => {
      expect(near(byUnit[u].camBalance, cam)).toBe(true);
      expect(near(byUnit[u].insBalance, ins)).toBe(true);
      expect(near(byUnit[u].retBalance, ret)).toBe(true);
    });
  }
});

describe("7010 office reconciliation", () => {
  const byUnit = Object.fromEntries(
    reconcileRetailBuilding(POOL_7010_OFFICE, TENANTS_7010_OFFICE_2025).tenants.map((t) => [t.unitRef, t]),
  );
  it("Parkwood Medical (203) ties to the office workbook", () => {
    const t = byUnit["7010-203"];
    expect(near(t.camBalance, 3538.05)).toBe(true);
    expect(near(t.insBalance, 46.89)).toBe(true);
    expect(near(t.retBalance, -388.77)).toBe(true);
  });
  it("Foot & Ankle (201) and Storage (218) are gross — nothing due", () => {
    expect(byUnit["7010-201"].camDue).toBe(0);
    expect(byUnit["7010-218"].camDue).toBe(0);
  });
});

describe("7010 allocation breakdown", () => {
  it("retail + office sums to the full vendor cost per line", () => {
    const camTotal = ALLOCATION_7010.cam.reduce((a, l) => a + l.retail + l.office, 0);
    expect(near(camTotal, 460614.18 + 122490.40, 1)).toBe(true);
    // Office-only lines carry no retail share.
    const water = ALLOCATION_7010.cam.find((l) => l.label.startsWith("Water"))!;
    expect(water.retail).toBe(0);
  });
});
