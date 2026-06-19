// Interim ("as-of month") retail reconciliation — for a mid-year move-out.
//
// Reuses the year-end retail engine (reconcileRetailTenant) unchanged. The only
// difference is the pool we hand it:
//   • CAM lines  → the YTD GL nets over the occupied/posted months (true YTD)
//     when provided, else the seed pool prorated to occupiedMonths/12.
//   • INS + RET pools, the controllable cap, an INS-pool override (Wawa) and a
//     flat RET → prorated to occupiedMonths/12, so a partial-year tenant
//     recovers its share of the period it occupied.
// Occupancy is then 1 (the proration is in the pools), so it isn't double-counted.

import { reconcileRetailTenant } from "./compute";
import type { RetailExpensePool, RetailTenantInput, RetailTenantResult } from "./types";

export type InterimRetailResult = RetailTenantResult & {
  occupiedMonths: number;
  asOfMonth: number;
  unpostedMonths: number;
};

export function reconcileInterimRetailTenant(args: {
  pool: RetailExpensePool;
  tenant: RetailTenantInput; // shares, exclusions, escrows (set by the caller for the window)
  occupiedMonths: number;
  asOfMonth: number;
  /** GL YTD net per CAM account over the occupied/posted window. When given,
   *  each CAM line's amount = its account's YTD; otherwise the seed × fraction. */
  ytdCamByAccount?: Record<string, number>;
  unpostedMonths?: number;
}): InterimRetailResult {
  const { pool, tenant, occupiedMonths, asOfMonth, ytdCamByAccount } = args;
  const fraction = occupiedMonths / 12;

  const camLines = pool.camLines.map((l) => ({
    ...l,
    amount: ytdCamByAccount ? (ytdCamByAccount[l.glAccount] ?? 0) : l.amount * fraction,
  }));
  const interimPool: RetailExpensePool = {
    ...pool,
    camLines,
    insAmount: pool.insAmount * fraction,
    retAmount: pool.retAmount * fraction,
  };

  // Proration is baked into the pools → occupancy = 1. The cap's prior
  // controllable, an INS-pool override, and a flat RET are annual figures, so
  // they prorate to the same window.
  const t: RetailTenantInput = {
    ...tenant,
    occPct: 1,
    camCap: tenant.camCap ? { ...tenant.camCap, priorControllable: tenant.camCap.priorControllable * fraction } : undefined,
    insPoolOverride: tenant.insPoolOverride != null ? tenant.insPoolOverride * fraction : undefined,
    flatRet: tenant.flatRet != null ? tenant.flatRet * fraction : undefined,
  };

  const res = reconcileRetailTenant(interimPool, t);
  return { ...res, occupiedMonths, asOfMonth, unpostedMonths: args.unpostedMonths ?? 0 };
}
