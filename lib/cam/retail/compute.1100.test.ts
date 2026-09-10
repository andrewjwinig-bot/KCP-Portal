// 1100 (Parkwood) retail reconciliation — ties to the workbook CAM tab's
// per-tenant Net Due columns. The simple case: one GLA, 10% admin, no
// exclusions/cap/discount.

import { describe, it, expect } from "vitest";
import { reconcileRetailBuilding } from "./compute";
import { POOL_1100, TENANTS_1100_2025 } from "./seed/1100";

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

describe("1100 retail reconciliation — connected from app data", () => {
  const result = reconcileRetailBuilding(POOL_1100, TENANTS_1100_2025);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // [CAM Net (P), INS Net (U), RET Net (AB)] from the workbook tenant table.
  const expected: Record<string, [number, number, number]> = {
    "1100-34": [9829.02, -122.95, 283.68], // Shear Sensation
    "1100-36": [5586.82, -74.35, 163.74],  // Honest Real Estate
  };

  for (const [unitRef, [cam, ins, ret]] of Object.entries(expected)) {
    it(`${unitRef} ties to the workbook (±$2)`, () => {
      const r = byUnit[unitRef];
      expect(near(r.camBalance, cam)).toBe(true);
      expect(near(r.insBalance, ins)).toBe(true);
      expect(near(r.retBalance, ret)).toBe(true);
    });
  }

  it("CAM pool totals 93,819.93 and 10% admin applies", () => {
    expect(near(POOL_1100.camLines.reduce((a, l) => a + l.amount, 0), 93819.93, 1)).toBe(true);
    expect(byUnit["1100-34"].adminFeePct).toBe(10);
  });
});
