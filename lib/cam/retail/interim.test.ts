import { describe, it, expect } from "vitest";
import { reconcileInterimRetailTenant } from "./interim";
import { POOL_2300 } from "./seed/2300";
import type { RetailTenantInput } from "./types";

// A plain retail tenant at Brookwood (2300): 2.26% share, 10% admin fee, no
// exclusions / cap / discount — so the math is easy to assert.
const TENANT: RetailTenantInput = {
  unitRef: "2300-1879", suite: "1879", name: "Test Retail", sqft: 2000,
  occPct: 1, camPrs: 2.26, insPrs: 2.26, retPrs: 2.26,
  camDenom: 50000, insDenom: 50000, retDenom: 50000,
  adminFeePct: 10, grossLease: false,
  camExcludedLabels: [], adminExcludedLabels: [], retDiscountPct: 0,
  camEscrow: 0, insEscrow: 0, retEscrow: 0,
};

// 6-month YTD = half each CAM line's annual amount.
const ytdHalf = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const l of POOL_2300.camLines) out[l.glAccount] = l.amount * 0.5;
  return out;
};

describe("retail interim (as-of-month) reconciliation", () => {
  it("recovers nothing when there are no YTD CAM costs and 0 occupied months of INS/RET", () => {
    const zero: Record<string, number> = {};
    for (const l of POOL_2300.camLines) zero[l.glAccount] = 0;
    const r = reconcileInterimRetailTenant({ pool: POOL_2300, tenant: TENANT, ytdCamByAccount: zero, occupiedMonths: 0, asOfMonth: 6 });
    expect(r.camDue).toBeCloseTo(0, 2);
    expect(r.insDue).toBeCloseTo(0, 2);
    expect(r.retDue).toBeCloseTo(0, 2);
  });

  it("CAM due = share × YTD pool × (1 + admin fee); INS/RET prorate the pool", () => {
    const ytd = ytdHalf();
    const r = reconcileInterimRetailTenant({ pool: POOL_2300, tenant: TENANT, ytdCamByAccount: ytd, occupiedMonths: 6, asOfMonth: 6 });
    const ytdPool = POOL_2300.camLines.reduce((a, l) => a + l.amount * 0.5, 0);
    expect(r.camDue).toBeCloseTo((2.26 / 100) * ytdPool * 1.1, 1); // + 10% admin
    expect(r.insDue).toBeCloseTo((2.26 / 100) * (POOL_2300.insAmount * 0.5), 1);
    expect(r.retDue).toBeCloseTo((2.26 / 100) * (POOL_2300.retAmount * 0.5), 1);
  });

  it("INS/RET shrink as the occupied window shrinks (proration)", () => {
    const ytd = ytdHalf();
    const six = reconcileInterimRetailTenant({ pool: POOL_2300, tenant: TENANT, ytdCamByAccount: ytd, occupiedMonths: 6, asOfMonth: 6 });
    const three = reconcileInterimRetailTenant({ pool: POOL_2300, tenant: TENANT, ytdCamByAccount: ytd, occupiedMonths: 3, asOfMonth: 3 });
    expect(three.insDue).toBeLessThan(six.insDue);
    expect(three.retDue).toBeLessThan(six.retDue);
  });

  it("a gross lease recovers nothing and metadata passes through", () => {
    const r = reconcileInterimRetailTenant({ pool: POOL_2300, tenant: { ...TENANT, grossLease: true }, ytdCamByAccount: ytdHalf(), occupiedMonths: 6, asOfMonth: 6, unpostedMonths: 1 });
    expect(r.camDue).toBe(0);
    expect(r.insDue).toBe(0);
    expect(r.retDue).toBe(0);
    expect(r.occupiedMonths).toBe(6);
    expect(r.unpostedMonths).toBe(1);
  });

  it("balances against escrow billed for the window", () => {
    const r = reconcileInterimRetailTenant({ pool: POOL_2300, tenant: { ...TENANT, camEscrow: 1000 }, ytdCamByAccount: ytdHalf(), occupiedMonths: 6, asOfMonth: 6 });
    expect(r.camBalance).toBeCloseTo(r.camDue - 1000, 2);
  });
});
