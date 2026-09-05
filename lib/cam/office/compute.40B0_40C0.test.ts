// 40B0 + 40C0 — connected builds (pools from SEED_EXPENSES, base years from
// tenant-meta, thin CAMPRep config). Both feature full-NNN anchors; 40C0 is a
// single full-building NNN tenant. Whole-dollar history vs cents workbook →
// small tolerance.

import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_40B0, TENANTS_40B0_2025 } from "./seed/40B0";
import { POOL_40C0, TENANTS_40C0_2025 } from "./seed/40C0";

const YEAR = 2025;
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe("40B0 reconciliation — connected from app data", () => {
  const result = reconcileBuilding(POOL_40B0, TENANTS_40B0_2025, YEAR);
  const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

  const expectedOpex: Record<string, number> = { "40B0-1": -10254.02, "40B0-3": -1000.45, "40B0-4": 0 };
  const expectedRet: Record<string, number> = { "40B0-1": 292.01, "40B0-3": 88.31, "40B0-4": 0 };

  for (const u of Object.keys(expectedOpex)) {
    it(`${u} ties to the workbook (±$5)`, () => {
      expect(near(byUnit[u].opexBalance, expectedOpex[u])).toBe(true);
      expect(near(byUnit[u].retBalance, expectedRet[u])).toBe(true);
    });
  }

  it("Just Children (1) is full-NNN (~73.4% of the pool)", () => {
    expect(byUnit["40B0-1"].noBaseStop).toBe(true);
  });

  it("US Connect (4) moved in 9/1/2025 (~33% occ) with a 2025 base → $0", () => {
    expect(Math.round(byUnit["40B0-4"].occPct * 1000) / 1000).toBe(0.334);
    expect(byUnit["40B0-4"].opexAmountDue).toBe(0);
  });

  it("base-2024 tenant (3) recovery comes from the lines that rose (~$199.55 due)", () => {
    expect(near(byUnit["40B0-3"].opexAmountDue, 199.55, 2)).toBe(true);
  });

  it("building totals tie (±$10)", () => {
    expect(near(result.totals.opexBalance, -11254.48, 10)).toBe(true);
    expect(near(result.totals.retBalance, 380.32, 10)).toBe(true);
  });
});

describe("40C0 reconciliation — single full-NNN tenant", () => {
  const result = reconcileBuilding(POOL_40C0, TENANTS_40C0_2025, YEAR);
  const t = result.tenants[0];

  it("recovers 100% of the full pool, no base-year stop, not grossed up", () => {
    expect(t.unitRef).toBe("40C0-CP");
    expect(t.noBaseStop).toBe(true);
    expect(t.grossUp).toBe(false);
    expect(near(t.opexAmountDue, 44879, 5)).toBe(true);
    expect(near(t.retAmountDue, 34210, 5)).toBe(true);
  });

  it("ties to the workbook balances (±$5)", () => {
    expect(near(t.opexBalance, -770.89)).toBe(true);
    expect(near(t.retBalance, 2720.06)).toBe(true);
  });
});
