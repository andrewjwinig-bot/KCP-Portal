// 40A0 — validates the connected build: pool from SEED_EXPENSES["40A0"],
// base years matching tenant-meta, thin CAMPRep config. Exercises a full-NNN
// anchor (Penn Emblem, ~80% of the pool) and a vacated suite owed an escrow
// refund. Whole-dollar app history vs cents workbook → small tolerance.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_40A0, TENANTS_40A0_2025 } from "./seed/40A0";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("40A0 reconciliation — connected from app data", () => {
  const result = reconcileBuilding(POOL_40A0, TENANTS_40A0_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // Workbook Building tab: Op Ex balance (col L) and RET balance (col P).
  const expectedOpex: Record<string, number> = {
    "40A0-A": -12298.87, "40A0-204": 594.44, "40A0-205": -851.89, "40A0-201": -3000,
  };
  const expectedRet: Record<string, number> = {
    "40A0-A": -704.72, "40A0-204": 132.64, "40A0-205": 85.84, "40A0-201": 0,
  };

  for (const unitRef of Object.keys(expectedOpex)) {
    it(`${unitRef} ties to the workbook (±$5)`, () => {
      expect(near(byUnit[unitRef].opexBalance, expectedOpex[unitRef])).toBe(true);
      expect(near(byUnit[unitRef].retBalance, expectedRet[unitRef])).toBe(true);
    });
  }

  it("Penn Emblem (A) is full-NNN — ~80.3% of the full opex + RET pool", () => {
    const t = byUnit["40A0-A"];
    expect(t.noBaseStop).toBe(true);
    expect(near(t.opexAmountDue, 0.80255917 * 104293, 5)).toBe(true);
    expect(near(t.retAmountDue, 0.80255917 * 29026, 5)).toBe(true);
  });

  it("the vacated suite (201) carries only the escrow refund (-$3,000)", () => {
    expect(byUnit["40A0-201"].occPct).toBe(0);
    expect(byUnit["40A0-201"].opexAmountDue).toBe(0);
    expect(byUnit["40A0-201"].opexBalance).toBe(-3000);
  });

  it("building totals tie to Building row 40 (±$10)", () => {
    expect(near(result.totals.opexBalance, -15556.32, 10)).toBe(true);
    expect(near(result.totals.retBalance, -486.23, 10)).toBe(true);
  });
});
