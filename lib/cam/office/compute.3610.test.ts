// 3610 — connected build, first JV III building (includes the Condo 6990
// line in the pool). Base years from tenant-meta, thin CAMPRep config.
// Exercises mid-year move-ins (202/203, base 2025 → $0), a mid-year downsize
// (302 Traffic Tech, base 2016 prorated through 7/31), and a non-grossed-up
// tenant (300). Whole-dollar history vs cents workbook → small tolerance.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_3610, TENANTS_3610_2025 } from "./seed/3610";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("3610 reconciliation — connected from app data (JV III)", () => {
  const result = reconcileBuilding(POOL_3610, TENANTS_3610_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // Workbook Building tab: Op Ex balance (col L) and RET balance (col P).
  const expectedOpex: Record<string, number> = {
    "3610-101": 864.83, "3610-103": 0, "3610-104": 330.28, "3610-105": -234.39,
    "3610-106": 567.77, "3610-202": 0, "3610-203": 0, "3610-205": 67.99,
    "3610-209": 227.43, "3610-300": -654.97, "3610-302": 894.80, "3610-305": 798.14,
    "3610-310": -1213.36,
  };
  const expectedRet: Record<string, number> = {
    "3610-101": 459.87, "3610-103": 0, "3610-104": 959.11, "3610-105": 340.84,
    "3610-106": 345.94, "3610-202": 0, "3610-203": 0, "3610-205": 182.89,
    "3610-209": 252.03, "3610-300": 1067.68, "3610-302": 463.00, "3610-305": 434.29,
    "3610-310": 479.33,
  };

  for (const u of Object.keys(expectedOpex)) {
    it(`${u} ties to the workbook (±$5)`, () => {
      expect(near(byUnit[u].opexBalance, expectedOpex[u])).toBe(true);
      expect(near(byUnit[u].retBalance, expectedRet[u])).toBe(true);
    });
  }

  it("the Condo (6990) line is part of the opex schedule (JV III)", () => {
    expect(byUnit["3610-101"].opexLines.some((l) => l.glAccount.startsWith("6990"))).toBe(true);
  });

  it("Traffic Tech (302) downsize: base 2016, prorated through 7/31 (~58%)", () => {
    expect(Math.round(byUnit["3610-302"].occPct * 1000) / 1000).toBe(0.581);
    expect(byUnit["3610-302"].baseYear).toBe(2016);
  });

  it("mid-year move-ins with a 2025 base recover nothing (202, 203)", () => {
    expect(byUnit["3610-202"].opexAmountDue).toBe(0);
    expect(byUnit["3610-203"].opexAmountDue).toBe(0);
  });

  it("building totals tie to Building row 40 (±$10)", () => {
    expect(near(result.totals.opexBalance, 1648.53, 10)).toBe(true);
    expect(near(result.totals.retBalance, 4984.98, 10)).toBe(true);
  });
});
