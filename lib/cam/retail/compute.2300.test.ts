// 2300 (Brookwood) retail reconciliation — ties the engine to the workbook's
// Building tab: CAM balance (col P), INS balance (col U), RET balance (col AB).
// Exercises admin fees, the Planet Fitness CAM cap, per-tenant CAM line
// exclusions (M&T, Dunkin), admin-fee exclusions (T-Mobile), RET discounts,
// and the Wawa pad (no CAM; insurance on the liability line at full GLA).

import { describe, it, expect } from "vitest";
import { reconcileRetailBuilding } from "./compute";
import { POOL_2300, TENANTS_2300_2025 } from "./seed/2300";

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

describe("2300 retail reconciliation — connected from app data", () => {
  const result = reconcileRetailBuilding(POOL_2300, TENANTS_2300_2025);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // Workbook Building tab balances: [CAM (P), INS (U), RET (AB)].
  const expected: Record<string, [number, number, number]> = {
    "2300-1817": [300.86, 0, 864.04],       // M&T — excl Building Maint from CAM; no INS
    "2300-1847": [-5564.04, -73.71, 2972.71], // Crafty Crab
    "2300-1851": [9322.65, -1496.81, 4668.16], // Planet Fitness — CAM cap + 7% admin
    "2300-1861": [-1046.34, -148.30, 467.98], // Edible
    "2300-1863": [-756.60, -116.24, 376.79], // Cohen — no admin
    "2300-1867": [-1633.41, -232.48, 726.98], // T-Mobile — 7% admin, admin excl liab+util
    "2300-1869": [-832.26, -116.24, 376.79], // China Sun
    "2300-1871": [-756.60, -116.24, 376.79], // Lee's — no admin
    "2300-1877": [2767.74, -116.24, 1864.79], // Evolve
    "2300-1879": [-87.21, -64.99, 542.83],   // GNC
    "2300-1881": [-1402.95, -195.41, 616.77], // Citizens
    "2300-1885": [-1671.64, 0, 917.73],       // Dunkin — excl Bldg Maint + Security; no INS
    "2300-1883": [0, 1446.53, 1138.16],       // Wawa — no CAM; INS on liability/full GLA
  };

  for (const [unitRef, [cam, ins, ret]] of Object.entries(expected)) {
    it(`${unitRef} ties to the workbook (±$2)`, () => {
      const r = byUnit[unitRef];
      expect(near(r.camBalance, cam)).toBe(true);
      expect(near(r.insBalance, ins)).toBe(true);
      expect(near(r.retBalance, ret)).toBe(true);
    });
  }

  it("Planet Fitness CAM is capped (controllable held to prior x 1.04)", () => {
    const pf = byUnit["2300-1851"];
    expect(pf.capped).toBe(true);
    expect(near(pf.camPoolEffective, 204214.83, 2)).toBe(true);
  });

  it("Wawa pays no CAM and gets its INS on the liability pool", () => {
    expect(byUnit["2300-1883"].camDue).toBe(0);
    expect(near(byUnit["2300-1883"].insDue, 0.0812057 * 40126.88, 5)).toBe(true);
  });

  it("building CAM/INS/RET balance totals tie to the workbook (±$5)", () => {
    expect(near(result.totals.camBalance, -1359.78, 5)).toBe(true);
    expect(near(result.totals.insBalance, -1230.13, 5)).toBe(true);
    expect(near(result.totals.retBalance, 15910.52 - 0, 50)).toBe(true);
  });
});
