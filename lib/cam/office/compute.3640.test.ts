// 3640 — connected build, last JV III building (includes Condo 6990). Base
// years from tenant-meta, thin CAMPRep config. Exercises two mid-year base-
// year resets (101 reset 10/1 → 75% recovery, 111 reset 7/1 → 50%), 1/1
// resets to a 2025 base (105/204 → $0), and non-grossed-up tenants.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_3640, TENANTS_3640_2025 } from "./seed/3640";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("3640 reconciliation — connected from app data (JV III)", () => {
  const result = reconcileBuilding(POOL_3640, TENANTS_3640_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  const expectedOpex: Record<string, number> = {
    "3640-101": 355.64, "3640-103": -923.41, "3640-105": 0, "3640-106": -80.65,
    "3640-107": -1275.55, "3640-108": -275.36, "3640-109": 0, "3640-111": -1144.05,
    "3640-204": 0, "3640-205": -300.96, "3640-206": 0, "3640-300": -3772.89,
    "3640-301": -985.46,
  };
  const expectedRet: Record<string, number> = {
    "3640-101": 483.62, "3640-103": 402.48, "3640-105": 0, "3640-106": 194.04,
    "3640-107": 859.00, "3640-108": 193.27, "3640-109": 0, "3640-111": 347.22,
    "3640-204": 0, "3640-205": 765.87, "3640-206": 0, "3640-300": 3809.72,
    "3640-301": 1704.33,
  };

  for (const u of Object.keys(expectedOpex)) {
    it(`${u} ties to the workbook (±$5)`, () => {
      expect(near(byUnit[u].opexBalance, expectedOpex[u])).toBe(true);
      expect(near(byUnit[u].retBalance, expectedRet[u])).toBe(true);
    });
  }

  it("mid-year resets prorate recovery (101 ~75% to 9/30, 111 ~50% to 6/30)", () => {
    expect(byUnit["3640-101"].baseYearResetISO).toBe("2025-10-01");
    expect(Math.round(byUnit["3640-101"].recoveryPct * 1000) / 1000).toBe(0.748);
    expect(byUnit["3640-101"].occPct).toBe(1); // occupancy stays full; recovery prorated
    expect(Math.round(byUnit["3640-111"].recoveryPct * 1000) / 1000).toBe(0.496);
  });

  it("1/1 resets to a 2025 base recover nothing (105, 204)", () => {
    expect(byUnit["3640-105"].opexAmountDue).toBe(0);
    expect(byUnit["3640-204"].opexAmountDue).toBe(0);
  });

  it("excludes former / zero-occupancy units (101B, 202A, 207E, 207)", () => {
    for (const u of ["3640-101B", "3640-202A", "3640-207E", "3640-207"]) {
      expect(byUnit[u]).toBeUndefined();
    }
  });

  it("building totals tie to Building row 40 (±$10)", () => {
    expect(near(result.totals.opexBalance, -8402.69, 10)).toBe(true);
    expect(near(result.totals.retBalance, 8759.55, 10)).toBe(true);
  });
});
