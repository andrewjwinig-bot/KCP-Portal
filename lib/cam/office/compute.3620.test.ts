// 3620 — connected build (JV III, includes Condo 6990). Base years from
// tenant-meta, thin CAMPRep config. All full-year tenants; exercises a
// non-grossed-up tenant (104) and a negative escrow (205). Whole-dollar
// history vs cents workbook → small tolerance.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_3620, TENANTS_3620_2025 } from "./seed/3620";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("3620 reconciliation — connected from app data (JV III)", () => {
  const result = reconcileBuilding(POOL_3620, TENANTS_3620_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  const expectedOpex: Record<string, number> = {
    "3620-100": -270.80, "3620-102": -141.61, "3620-104": -2681.17, "3620-108": -642.55,
    "3620-110": -7699.87, "3620-205": 947.10, "3620-208": -1056.23, "3620-209": -356.88,
    "3620-210": -201.40, "3620-307": 147.57, "3620-312": -660.16,
  };
  const expectedRet: Record<string, number> = {
    "3620-100": 293.33, "3620-102": 301.62, "3620-104": 208.42, "3620-108": 280.00,
    "3620-110": 3322.70, "3620-205": 214.28, "3620-208": 837.91, "3620-209": 160.00,
    "3620-210": 133.33, "3620-307": 3716.55, "3620-312": 300.00,
  };

  for (const u of Object.keys(expectedOpex)) {
    it(`${u} ties to the workbook (±$5)`, () => {
      expect(near(byUnit[u].opexBalance, expectedOpex[u])).toBe(true);
      expect(near(byUnit[u].retBalance, expectedRet[u])).toBe(true);
    });
  }

  it("the negative escrow (205, -$689) adds to the balance", () => {
    expect(byUnit["3620-205"].opexEscrow).toBe(-689);
    expect(near(byUnit["3620-205"].opexBalance, byUnit["3620-205"].opexAmountDue + 689)).toBe(true);
  });

  it("the Condo (6990) line is part of the opex schedule (JV III)", () => {
    expect(byUnit["3620-100"].opexLines.some((l) => l.glAccount.startsWith("6990"))).toBe(true);
  });

  it("building totals tie to Building row 40 (±$10)", () => {
    expect(near(result.totals.opexBalance, -12615.99, 10)).toBe(true);
    expect(near(result.totals.retBalance, 9768.13, 10)).toBe(true);
  });
});
