// 4060 (Building 6) — validates the connected build: pool derived from
// SEED_EXPENSES["4060"], base years matching tenant-meta, thin CAMPRep
// config. App history is whole-dollar (workbook used cents), so balances are
// checked within a small tolerance — the methodology, not a re-keyed copy.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_4060, TENANTS_4060_2025 } from "./seed/4060";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("4060 reconciliation — connected from app data", () => {
  const result = reconcileBuilding(POOL_4060, TENANTS_4060_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  // Workbook Building tab: Op Ex balance (col L) and RET balance (col P).
  // 4060-208 intentionally diverges: its 2026 base year is after the 2025
  // recon year, so nothing is due (workbook showed a full-pool recovery of
  // 953.26 / 262.75, which — like GLT at 4070 — we treat as the bug it is).
  const expectedOpex: Record<string, number> = {
    "4060-100": 0, "4060-105": 0, "4060-111": 0, "4060-113": 484.85,
    "4060-204": 0, "4060-205": -1227.80, "4060-206": 196.73, "4060-207": 580.42,
    "4060-208": 0, "4060-210": -624.05, "4060-211": 61.54, "4060-212": 454.78,
    "4060-215": 254.49, "4060-401": 7783.94, "4060-402": 4169.69, "4060-403": 1344.03,
    "4060-600": 11476.02,
  };

  for (const unitRef of Object.keys(expectedOpex)) {
    it(`${unitRef} Op Ex ties to the workbook (±$5)`, () => {
      expect(near(byUnit[unitRef].opexBalance, expectedOpex[unitRef])).toBe(true);
    });
  }

  it("RET nets to zero for every tenant (RET fell below all base years)", () => {
    for (const t of result.tenants) expect(near(t.retBalance, 0)).toBe(true);
  });

  it("the future-base tenant (208, base 2026) recovers nothing", () => {
    expect(byUnit["4060-208"].futureBaseYear).toBe(true);
    expect(byUnit["4060-208"].opexAmountDue).toBe(0);
    expect(byUnit["4060-208"].retAmountDue).toBe(0);
  });

  it("the mid-year move-out (600) is ~91.5% occupancy", () => {
    expect(Math.round(byUnit["4060-600"].occPct * 1000) / 1000).toBe(0.915);
  });

  it("gross-lease / non-reconciling tenants are excluded", () => {
    for (const u of ["4060-300", "4060-500", "4060-217", "4060-208B", "4060-117A"]) {
      expect(byUnit[u]).toBeUndefined();
    }
  });

  it("building Op Ex total ties to the workbook less the 208 divergence (±$10)", () => {
    // Workbook total col L = 25,907.89, of which 208 contributes 953.26.
    expect(near(result.totals.opexBalance, 25907.89 - 953.26, 10)).toBe(true);
    expect(near(result.totals.retBalance, 0, 5)).toBe(true);
  });
});
