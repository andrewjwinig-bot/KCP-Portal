// 4050 (Building 5) — validates the connected build: pool derived from
// SEED_EXPENSES["4050"], base years matching tenant-meta, thin CAMPRep
// config. The app's expense history is whole-dollar (the workbook used
// cents), so balances are checked within a small tolerance rather than to
// the penny — the methodology, not a re-keyed copy.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_4050, TENANTS_4050_2025 } from "./seed/4050";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("4050 reconciliation — connected from app data", () => {
  const result = reconcileBuilding(POOL_4050, TENANTS_4050_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // Workbook Building tab: Op Ex balance (col L) and RET balance (col P).
  const expectedOpex: Record<string, number> = {
    "4050-113": -1580.47, "4050-115": -409.37, "4050-201": -382.39, "4050-205": -2001.60,
    "4050-206": -360.31, "4050-207": -2455.32, "4050-215": 246.74, "4050-300": -86.68,
    "4050-301": -633.36, "4050-307": 206.89, "4050-119B": -226.84,
  };
  const expectedRet: Record<string, number> = {
    "4050-113": 0, "4050-115": 129.43, "4050-201": 207.43, "4050-205": 726.81,
    "4050-206": 433.34, "4050-207": 758.51, "4050-215": 90.39, "4050-300": 177.30,
    "4050-301": 340.98, "4050-307": 110.05, "4050-119B": 119.96,
  };

  for (const unitRef of Object.keys(expectedOpex)) {
    it(`${unitRef} ties to the workbook (±$5)`, () => {
      const r = byUnit[unitRef];
      expect(near(r.opexBalance, expectedOpex[unitRef])).toBe(true);
      expect(near(r.retBalance, expectedRet[unitRef])).toBe(true);
    });
  }

  it("move-outs are partial-year occupancy (Relentless ~16%, Open Systems ~33%)", () => {
    expect(Math.round(byUnit["4050-215"].occPct * 100)).toBe(16);
    expect(Math.round(byUnit["4050-119B"].occPct * 100)).toBe(33);
  });

  it("the gross-lease tenant (Fenningham 315) is excluded", () => {
    expect(byUnit["4050-315"]).toBeUndefined();
  });

  it("building totals tie to Building row 40 (±$10)", () => {
    expect(near(result.totals.opexBalance, -7682.68, 10)).toBe(true);
    expect(near(result.totals.retBalance, 3094.20, 10)).toBe(true);
  });
});
