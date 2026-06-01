// Ties the engine out to the 4070_2025_CAM_and_RET_Billing workbook.
// Expected values are read straight from its "Building" tab (per-tenant
// Op Ex / RET balances) and "Year End Adjustments" tab (Skyline amounts).

import { describe, it, expect } from "vitest";
import { reconcileBuilding, reconcileTenant } from "./compute";
import { POOL_4070, TENANTS_4070_2025 } from "./seed/4070";

const YEAR = 2025;
const r2 = (n: number) => Math.round(n * 100) / 100;

describe("office CAM/RET reconciliation — 4070 (2025)", () => {
  const byUnit = Object.fromEntries(
    TENANTS_4070_2025.map((t) => [t.unitRef, reconcileTenant(POOL_4070, t, YEAR)]),
  );

  it("Bucks County (mid-year, base 2022) ties to the tenant page", () => {
    const b = byUnit["4070-103"];
    expect(r2(b.opexNetIncrease)).toBe(50364.78);
    expect(r2(b.opexAmountDue)).toBe(549.46);
    expect(r2(b.opexBalance)).toBe(-1550.54); // Year End CAM Adjustment
    expect(r2(b.retAmountDue)).toBe(225.33);
    expect(r2(b.retBalance)).toBe(105.33); // Year End RET Adjustment
  });

  it("GLT (base year with no data → full pool) ", () => {
    const g = byUnit["4070-115"];
    expect(r2(g.opexBalance)).toBe(944.46);
    expect(r2(g.retBalance)).toBe(369.85);
  });

  // Per-tenant Op Ex balance (Building tab col L) and RET balance (col P).
  const expectedOpexBalance: Record<string, number> = {
    "4070-103": -1550.54, "4070-107": -2494.73, "4070-113": -3756.75, "4070-115": 944.46,
    "4070-116": -4378.59, "4070-117": -2707.01, "4070-201": -2289.74, "4070-209": 0,
    "4070-211": -596.57, "4070-215": -3843.92, "4070-301": -2505.2, "4070-400": -3256.31,
    "4070-411": -15149.35, "4070-415": -8542.58,
  };
  const expectedRetBalance: Record<string, number> = {
    "4070-103": 105.33, "4070-107": 0, "4070-113": 292.69, "4070-115": 369.85,
    "4070-116": 900.28, "4070-117": 0, "4070-201": 273.28, "4070-209": 0,
    "4070-211": 95.05, "4070-215": 307.52, "4070-301": 1053.34, "4070-400": -466.36,
    "4070-411": -30.99, "4070-415": 1202.05,
  };

  for (const t of TENANTS_4070_2025) {
    it(`${t.name} (${t.unitRef}) Op Ex + RET balances tie out`, () => {
      const r = byUnit[t.unitRef];
      expect(r2(r.opexBalance)).toBe(expectedOpexBalance[t.unitRef]);
      expect(r2(r.retBalance)).toBe(expectedRetBalance[t.unitRef]);
    });
  }

  it("building totals tie to the Building tab row 40", () => {
    const { totals } = reconcileBuilding(POOL_4070, TENANTS_4070_2025, YEAR);
    expect(r2(totals.opexAmountDue)).toBe(30373.17);
    expect(r2(totals.opexEscrow)).toBe(80500);
    expect(r2(totals.opexBalance)).toBe(-50126.83);
    expect(r2(totals.retAmountDue)).toBe(9436.04);
    expect(r2(totals.retEscrow)).toBe(5334);
    expect(r2(totals.retBalance)).toBe(4102.04);
  });
});
