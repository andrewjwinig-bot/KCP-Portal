// The retail reconciliation engine. Pure functions: pool + tenant inputs in,
// per-tenant CAM/INS/RET statements + building totals out.
//
//   CAM due = camPRS × effectiveCamPool + adminCharge
//     • effectiveCamPool = full pool − the tenant's excluded lines, then
//       (if the lease caps controllable CAM) controllable capped at
//       priorControllable × (1+growth), plus the non-controllable lines.
//     • adminCharge = adminFee × camPRS × (effectiveCamPool − admin-excluded lines)
//   INS due = insPRS × insPool (Wawa overrides the pool to the liability line)
//   RET due = retPRS × retPool × (1 − retDiscount)
//   balance = due − escrow   (negative = credit to the tenant)

import type {
  RetailExpensePool,
  RetailTenantInput,
  RetailTenantResult,
  RetailBuildingResult,
} from "./types";

const lc = (s: string) => s.trim().toLowerCase();

/** Sum the pool's CAM lines, optionally filtered. */
function sumLines(pool: RetailExpensePool, keep: (l: RetailExpensePool["camLines"][number]) => boolean): number {
  return pool.camLines.filter(keep).reduce((a, l) => a + l.amount, 0);
}

export function reconcileRetailTenant(pool: RetailExpensePool, t: RetailTenantInput): RetailTenantResult {
  const excluded = new Set(t.camExcludedLabels.map(lc));
  const adminExcluded = new Set(t.adminExcludedLabels.map(lc));

  // Lines this tenant is actually billed for (full pool minus their exclusions).
  const billedLines = pool.camLines.filter((l) => !excluded.has(lc(l.label)));
  const camPoolTenant = billedLines.reduce((a, l) => a + l.amount, 0);

  // Optional controllable-CAM cap.
  let camPoolEffective = camPoolTenant;
  let capped = false;
  if (t.camCap) {
    const uncontrollable = billedLines.filter((l) => l.nonControllable).reduce((a, l) => a + l.amount, 0);
    const controllable = camPoolTenant - uncontrollable;
    const capAmount = t.camCap.priorControllable * (1 + t.camCap.growthPct / 100);
    const cappedControllable = Math.min(controllable, capAmount);
    capped = cappedControllable < controllable;
    camPoolEffective = cappedControllable + uncontrollable;
  }

  const camShare = (t.camPrs / 100) * camPoolEffective;
  // Admin fee applies to the effective pool less any admin-excluded lines
  // (scaled by the same exclusion/cap treatment via the billed lines).
  const adminExcludedAmt = billedLines.filter((l) => adminExcluded.has(lc(l.label))).reduce((a, l) => a + l.amount, 0);
  const adminBase = Math.max(0, camPoolEffective - adminExcludedAmt);
  const camAdmin = (t.adminFeePct / 100) * (t.camPrs / 100) * adminBase;
  const camDue = t.grossLease ? 0 : camShare + camAdmin;
  const camBalance = camDue - t.camEscrow;

  const insPool = t.insPoolOverride ?? pool.insAmount;
  const insDue = t.grossLease ? 0 : (t.insPrs / 100) * insPool;
  const insBalance = insDue - t.insEscrow;

  const retDue = t.grossLease ? 0 : (t.retPrs / 100) * pool.retAmount * (1 - t.retDiscountPct / 100);
  const retBalance = retDue - t.retEscrow;

  return {
    unitRef: t.unitRef, suite: t.suite, name: t.name, sqft: t.sqft,
    grossLease: t.grossLease,
    camPrs: t.camPrs, insPrs: t.insPrs, retPrs: t.retPrs,
    adminFeePct: t.adminFeePct, retDiscountPct: t.retDiscountPct,
    camExcludedLabels: t.camExcludedLabels, adminExcludedLabels: t.adminExcludedLabels,
    camCap: t.camCap,
    camPoolFull: pool.camLines.reduce((a, l) => a + l.amount, 0),
    camPoolEffective, insPool, retPool: pool.retAmount, capped,
    camShare, camAdmin, camDue, camEscrow: t.camEscrow, camBalance,
    insDue, insEscrow: t.insEscrow, insBalance,
    retDue, retEscrow: t.retEscrow, retBalance,
  };
}

export function reconcileRetailBuilding(pool: RetailExpensePool, tenants: RetailTenantInput[]): RetailBuildingResult {
  const results = tenants.map((t) => reconcileRetailTenant(pool, t));
  const totals = results.reduce(
    (a, r) => {
      a.camDue += r.camDue; a.camEscrow += r.camEscrow; a.camBalance += r.camBalance;
      a.insDue += r.insDue; a.insEscrow += r.insEscrow; a.insBalance += r.insBalance;
      a.retDue += r.retDue; a.retEscrow += r.retEscrow; a.retBalance += r.retBalance;
      return a;
    },
    { camDue: 0, camEscrow: 0, camBalance: 0, insDue: 0, insEscrow: 0, insBalance: 0, retDue: 0, retEscrow: 0, retBalance: 0 },
  );
  return { propertyCode: pool.propertyCode, reconYear: pool.reconYear, tenants: results, totals };
}

// Re-export so seeds/route can keep imports local.
export { sumLines };
