// Ties the engine out to the 4070_2025_CAM_and_RET_Billing workbook.
// Expected values are read straight from its "Building" tab (per-tenant
// Op Ex / RET balances) and "Year End Adjustments" tab (Skyline amounts).

import { describe, it, expect } from "vitest";
import { reconcileBuilding, reconcileTenant } from "./compute";
import { POOL_4070, POOL_4070_WORKBOOK, TENANTS_4070_2025 } from "./seed/4070";

const YEAR = 2025;
const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("office CAM/RET reconciliation — 4070 (2025)", () => {
  const byUnit = Object.fromEntries(
    TENANTS_4070_2025.map((t) => [t.unitRef, reconcileTenant(POOL_4070_WORKBOOK, t, YEAR)]),
  );

  it("Bucks County (mid-year, base 2022) ties to the tenant page", () => {
    const b = byUnit["4070-103"];
    expect(r2(b.opexNetIncrease)).toBe(50364.78);
    expect(r2(b.opexAmountDue)).toBe(549.46);
    expect(r2(b.opexBalance)).toBe(-1550.54); // Year End CAM Adjustment
    expect(r2(b.retAmountDue)).toBe(225.33);
    expect(r2(b.retBalance)).toBe(105.33); // Year End RET Adjustment
  });

  it("GLT (future base year 2026) owes nothing", () => {
    const g = byUnit["4070-115"];
    expect(g.futureBaseYear).toBe(true);
    expect(g.opexNetIncrease).toBe(0);
    expect(r2(g.opexAmountDue)).toBe(0);
    expect(r2(g.retAmountDue)).toBe(0);
    // No escrow collected → balances are zero, not a credit.
    expect(r2(g.opexBalance)).toBe(0);
    expect(r2(g.retBalance)).toBe(0);
  });

  // Per-tenant Op Ex balance (Building tab col L) and RET balance (col P).
  // GLT (4070-115) intentionally diverges from the workbook: its 2026 base
  // year is after the 2025 recon year, so nothing is due (workbook showed a
  // full-pool recovery, which we treat as the bug it is).
  const expectedOpexBalance: Record<string, number> = {
    "4070-103": -1550.54, "4070-107": -2494.73, "4070-113": -3756.75, "4070-115": 0,
    // 4070-201 (Robert Half) uses an aggregate base-year stop with recovery
    // through 5/31 — see aggregateBaseYear.test.ts (ties to the corrected
    // Schedule of Expenses: −$3,292 OpEx, $228 RET).
    "4070-116": -4378.59, "4070-117": -2707.01, "4070-201": -3292.19, "4070-209": 0,
    "4070-211": -596.57, "4070-215": -3843.92, "4070-301": -2505.2, "4070-400": -3256.31,
    "4070-411": -15149.35, "4070-415": -8542.58,
  };
  const expectedRetBalance: Record<string, number> = {
    "4070-103": 105.33, "4070-107": 0, "4070-113": 292.69, "4070-115": 0,
    "4070-116": 900.28, "4070-117": 0, "4070-201": 227.99, "4070-209": 0,
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

  it("building totals equal the sum of per-tenant balances", () => {
    const { totals, tenants } = reconcileBuilding(POOL_4070_WORKBOOK, TENANTS_4070_2025, YEAR);
    const sum = (f: (x: typeof tenants[number]) => number) => r2(tenants.reduce((a, x) => a + f(x), 0));
    expect(r2(totals.opexBalance)).toBe(sum((x) => x.opexBalance));
    expect(r2(totals.retBalance)).toBe(sum((x) => x.retBalance));
    expect(r2(totals.opexEscrow)).toBe(80500);
    expect(r2(totals.retEscrow)).toBe(5334);
  });

  // The PRODUCTION pool is derived from the app's whole-dollar Expense History
  // (SEED_EXPENSES["4070"]) rather than the cents workbook. Confirm that the
  // connected pool still ties to the same workbook balances within a small
  // rounding tolerance — i.e. migrating 4070 to the derived pool did not move
  // the reconciliation off the workbook beyond sub-dollar rounding.
  describe("derived production pool ties to the workbook (±$5)", () => {
    const derived = Object.fromEntries(
      TENANTS_4070_2025.map((t) => [t.unitRef, reconcileTenant(POOL_4070, t, YEAR)]),
    );
    for (const t of TENANTS_4070_2025) {
      it(`${t.unitRef} within tolerance`, () => {
        expect(near(derived[t.unitRef].opexBalance, expectedOpexBalance[t.unitRef])).toBe(true);
        expect(near(derived[t.unitRef].retBalance, expectedRetBalance[t.unitRef])).toBe(true);
      });
    }
  });
});
