// Interim ("as-of month") office reconciliation — for a mid-year move-out.
//
// Reuses the year-end engine (reconcileTenant) unchanged. The only differences
// from a year-end run are the inputs we hand it:
//   • Recon-year actuals = the YTD GL nets summed over the OCCUPIED months
//     (true YTD — the actual expenses incurred while the tenant was in place),
//     not a full-year figure.
//   • The base-year stop is prorated to the occupied fraction (occupiedMonths /
//     12), so the tenant recovers its share of the increase over the *prorated*
//     base — apples to apples with the partial-year actuals.
//   • Billed (escrow) = the rent-roll monthly CAM / RET estimate × occupied
//     months.
// Gross-up (-95) variants aren't in the GL, so we gross up the raw YTD by the
// seeded gross-up ratio.

import { reconcileTenant } from "./compute";
import type { OfficeExpensePool, OfficeTenantInput, TenantReconResult } from "./types";

/** YTD sum of each account's GL monthly nets over months 1..throughMonth
 *  (1-based, capped at 12). The cash-analysis GL stores debit-positive nets;
 *  expense accounts read positive, which is what the pool expects. */
export function ytdActualsByAccount(monthly: Record<string, number[]>, throughMonth: number): Record<string, number> {
  const m = Math.max(0, Math.min(12, Math.round(throughMonth)));
  const out: Record<string, number> = {};
  for (const [account, nets] of Object.entries(monthly)) {
    let s = 0;
    for (let i = 0; i < m && i < nets.length; i++) s += nets[i] || 0;
    out[account] = s;
  }
  return out;
}

/** Gross-up ratio (95% variant ÷ raw) for an account, taken from the latest
 *  seeded year that carries both — used to gross up the recon-year YTD actual
 *  (the GL only has the raw account). 1 when no usable -95 history exists. */
function grossUpRatio(pool: OfficeExpensePool, rawAccount: string, grossUpAccount: string): number {
  const raw = pool.values[rawAccount] ?? {};
  const g = pool.values[grossUpAccount] ?? {};
  let bestYear = -Infinity;
  let ratio = 1;
  for (const y of Object.keys(g)) {
    const yr = Number(y);
    if (Number.isFinite(yr) && raw[y] && g[y] && yr > bestYear) { bestYear = yr; ratio = g[y] / raw[y]; }
  }
  return ratio;
}

export type InterimReconResult = TenantReconResult & {
  /** Months of the recon year the tenant occupied through the as-of month. */
  occupiedMonths: number;
  /** The as-of (statement) month, 1–12. */
  asOfMonth: number;
  /** Occupied months not yet posted to the GL — actuals are understated by
   *  that much (GL posts ~a month in arrears). 0 when fully posted. */
  unpostedMonths: number;
};

/** Reconcile one office tenant as-of a month. `ytdRawByAccount` is the GL YTD
 *  over the occupied/posted window (raw GL accounts → dollars). */
export function reconcileInterimTenant(args: {
  pool: OfficeExpensePool;
  tenant: OfficeTenantInput; // baseYear, grossUp, proRataPct, camMonthly, retMonthly, sqft…
  reconYear: number;
  ytdRawByAccount: Record<string, number>;
  occupiedMonths: number;
  asOfMonth: number;
  unpostedMonths?: number;
}): InterimReconResult {
  const { pool, tenant, reconYear, ytdRawByAccount, occupiedMonths, asOfMonth } = args;
  const fraction = occupiedMonths / 12;
  const ry = String(reconYear);
  const by = String(tenant.baseYear);

  // Copy every account's history with the base-year column scaled to the
  // occupied fraction; then overlay the recon-year column with the YTD actuals
  // (raw accounts, and their grossed-up -95 variants).
  const values: OfficeExpensePool["values"] = {};
  for (const [acct, byYear] of Object.entries(pool.values)) {
    values[acct] = byYear[by] != null ? { ...byYear, [by]: byYear[by] * fraction } : { ...byYear };
  }
  for (const line of pool.opexLines) {
    const rawYtd = ytdRawByAccount[line.glAccount] ?? 0;
    values[line.glAccount] = { ...(values[line.glAccount] ?? {}), [ry]: rawYtd };
    if (line.grossUpAccount) {
      const grossed = rawYtd * grossUpRatio(pool, line.glAccount, line.grossUpAccount);
      values[line.grossUpAccount] = { ...(values[line.grossUpAccount] ?? {}), [ry]: grossed };
    }
  }
  values[pool.retAccount] = { ...(values[pool.retAccount] ?? {}), [ry]: ytdRawByAccount[pool.retAccount] ?? 0 };

  const scaledPool: OfficeExpensePool = { ...pool, values };
  // Expenses are already windowed to the occupied months, so occupancy is fully
  // captured — don't double-prorate via occPct/recoveryPct.
  const t: OfficeTenantInput = { ...tenant, occPct: 1, recoveryPct: 1 };
  const res = reconcileTenant(scaledPool, t, reconYear);
  return { ...res, occupiedMonths, asOfMonth, unpostedMonths: args.unpostedMonths ?? 0 };
}
