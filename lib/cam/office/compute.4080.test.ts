// 4080 (Building 8) — validates the connected build: pool derived from
// SEED_EXPENSES["4080"], base years matching tenant-meta, thin CAMPRep
// config. Exercises a full-NNN tenant (401, no base-year stop), mixed
// gross-up, and RET increases (base-year-2024 tenants owe RET). App history
// is whole-dollar (workbook used cents), so balances are checked within a
// small tolerance — the methodology, not a re-keyed copy.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_4080, TENANTS_4080_2025 } from "./seed/4080";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("4080 reconciliation — connected from app data", () => {
  const result = reconcileBuilding(POOL_4080, TENANTS_4080_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // Workbook Building tab: Op Ex balance (col L) and RET balance (col P).
  const expectedOpex: Record<string, number> = {
    "4080-100": 485.13, "4080-102": 5077.84, "4080-107": 497.92, "4080-109": -1202.14,
    "4080-111": 406.07, "4080-117": 2200.14, "4080-207": 0, "4080-209": -106.51,
    "4080-210": -2753.83, "4080-215": -544.16, "4080-217": 190.25, "4080-219": -4086.72,
    "4080-305": 7601.00, "4080-400": -1252.83, "4080-401": -44685.51,
  };
  const expectedRet: Record<string, number> = {
    "4080-100": 0, "4080-102": 0, "4080-107": 0, "4080-109": 395.22,
    "4080-111": 0, "4080-117": -216, "4080-207": 0, "4080-209": -168,
    "4080-210": 541.999, "4080-215": 0, "4080-217": 0, "4080-219": 684.55,
    "4080-305": 0, "4080-400": 0, "4080-401": 30937.55,
  };

  for (const unitRef of Object.keys(expectedOpex)) {
    it(`${unitRef} ties to the workbook (±$5)`, () => {
      expect(near(byUnit[unitRef].opexBalance, expectedOpex[unitRef])).toBe(true);
      expect(near(byUnit[unitRef].retBalance, expectedRet[unitRef])).toBe(true);
    });
  }

  it("the NNN tenant (401) recovers 12% of the full pool — no base-year stop", () => {
    const t = byUnit["4080-401"];
    expect(t.noBaseStop).toBe(true);
    // 12% of raw opex 2025 (657,621) and RET 2025 (257,813).
    expect(near(t.opexAmountDue, 0.12 * 657621, 5)).toBe(true);
    expect(near(t.retAmountDue, 0.12 * 257813, 5)).toBe(true);
    expect(t.dataWarnings).toBeUndefined(); // exempt from the base-year guard
  });

  it("base-year-2024 tenants owe RET; older base years floor to zero", () => {
    expect(near(byUnit["4080-210"].retAmountDue, 661.998, 2)).toBe(true);
    expect(byUnit["4080-215"].retAmountDue).toBe(0); // base 2014
  });

  it("non-reconciling / future tenants are excluded", () => {
    for (const u of ["4080-221", "4080-201", "4080-GYM", "4080-RT1", "4080-112B"]) {
      expect(byUnit[u]).toBeUndefined();
    }
  });

  it("building totals tie to Building row 40 (±$10)", () => {
    expect(near(result.totals.opexBalance, -38173.34, 10)).toBe(true);
    expect(near(result.totals.retBalance, 32175.32, 10)).toBe(true);
  });
});
