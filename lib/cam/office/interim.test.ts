import { describe, it, expect } from "vitest";
import { reconcileInterimTenant, ytdActualsByAccount } from "./interim";
import { POOL_3610 } from "./seed/3610";
import type { OfficeTenantInput } from "./types";

// Apollo Acquisitions @ 3610-203 — gross-up lease, base year 2025, 3.29% share.
// Vacating mid-2026, so its 2026 move-out rec recovers the 2026-over-2025
// increase, prorated to the occupied months.
const APOLLO: OfficeTenantInput = {
  unitRef: "3610-203", skylineUnit: "3610-203-CU", suite: "203", name: "Apollo Acquisitions, Inc.",
  baseYear: 2025, grossUp: true, proRataPct: 3.29, sqft: 1311,
  occPct: 1, recoveryPct: 1, opexEscrow: 0, retEscrow: 0, camMonthly: 200, retMonthly: 50,
};

// A plausible 2026 YTD: each raw account at a multiple of half its 2025 figure.
const ytdRaw = (factor: number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const line of POOL_3610.opexLines) out[line.glAccount] = (POOL_3610.values[line.glAccount]?.["2025"] ?? 0) * 0.5 * factor;
  out[POOL_3610.retAccount] = (POOL_3610.values[POOL_3610.retAccount]?.["2025"] ?? 0) * 0.5 * factor;
  return out;
};

describe("office interim (as-of-month) reconciliation", () => {
  it("ytdActualsByAccount sums months 1..throughMonth", () => {
    const monthly = { "6610-8502": [10, 20, 30, 40, 50, 60, 0, 0, 0, 0, 0, 0] };
    expect(ytdActualsByAccount(monthly, 6)["6610-8502"]).toBe(210);
    expect(ytdActualsByAccount(monthly, 3)["6610-8502"]).toBe(60);
    expect(ytdActualsByAccount(monthly, 0)["6610-8502"]).toBe(0);
    expect(ytdActualsByAccount(monthly, 99)["6610-8502"]).toBe(210); // capped at 12
  });

  it("recovers nothing when YTD actuals don't exceed the prorated base", () => {
    // YTD == half of 2025 (== the prorated base for a 6/12 window) → no increase.
    const res = reconcileInterimTenant({
      pool: POOL_3610, tenant: APOLLO, reconYear: 2026,
      ytdRawByAccount: ytdRaw(1.0), occupiedMonths: 6, asOfMonth: 6,
    });
    expect(res.opexAmountDue).toBeCloseTo(0, 2);
    expect(res.retAmountDue).toBeCloseTo(0, 2);
  });

  it("recovers a positive share of the increase over the prorated base", () => {
    const res = reconcileInterimTenant({
      pool: POOL_3610, tenant: APOLLO, reconYear: 2026,
      ytdRawByAccount: ytdRaw(1.1), occupiedMonths: 6, asOfMonth: 6, // 10% above the prorated base
    });
    expect(res.opexAmountDue).toBeGreaterThan(0);
    expect(res.opexNetIncrease).toBeGreaterThan(0);
    // Due is the tenant's pro-rata share of the net increase.
    expect(res.opexAmountDue).toBeCloseTo(res.opexNetIncrease * 0.0329, 2);
  });

  it("rises with bigger YTD actuals (monotonic)", () => {
    const lo = reconcileInterimTenant({ pool: POOL_3610, tenant: APOLLO, reconYear: 2026, ytdRawByAccount: ytdRaw(1.1), occupiedMonths: 6, asOfMonth: 6 });
    const hi = reconcileInterimTenant({ pool: POOL_3610, tenant: APOLLO, reconYear: 2026, ytdRawByAccount: ytdRaw(1.3), occupiedMonths: 6, asOfMonth: 6 });
    expect(hi.opexAmountDue).toBeGreaterThan(lo.opexAmountDue);
  });

  it("subtracts more base as occupied months grow (proration works)", () => {
    // Same YTD actuals, but a longer occupied window subtracts a larger base
    // stop → a smaller net increase.
    const six = reconcileInterimTenant({ pool: POOL_3610, tenant: APOLLO, reconYear: 2026, ytdRawByAccount: ytdRaw(1.1), occupiedMonths: 6, asOfMonth: 6 });
    const ten = reconcileInterimTenant({ pool: POOL_3610, tenant: APOLLO, reconYear: 2026, ytdRawByAccount: ytdRaw(1.1), occupiedMonths: 10, asOfMonth: 10 });
    expect(ten.opexAmountDue).toBeLessThanOrEqual(six.opexAmountDue);
  });

  it("balances against the billed escrow and passes through metadata", () => {
    const res = reconcileInterimTenant({
      pool: POOL_3610, tenant: { ...APOLLO, opexEscrow: 1200 }, reconYear: 2026,
      ytdRawByAccount: ytdRaw(1.1), occupiedMonths: 6, asOfMonth: 6, unpostedMonths: 1,
    });
    expect(res.opexBalance).toBeCloseTo(res.opexAmountDue - 1200, 2);
    expect(res.occupiedMonths).toBe(6);
    expect(res.asOfMonth).toBe(6);
    expect(res.unpostedMonths).toBe(1);
  });
});
