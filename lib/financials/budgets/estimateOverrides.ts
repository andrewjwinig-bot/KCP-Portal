// A tenant's monthly CAM / INS / RET estimate, set by hand on the CAM
// estimates table — and it IS the budget: the override replaces the engine's
// figure in that tenant's months, so the recovery lines, Revenue by tenant and
// the Skyline import all carry what was decided. Every override carries a
// REASON, because an estimate that moved has to be explained to the tenant.
//
// Pure: storage is `estimateOverrideStore.ts`.

import type { ReimbursementEstimate } from "./reimbursementEstimate";

export type EstimatePart = "cam" | "ins" | "ret";
export const ESTIMATE_PARTS: EstimatePart[] = ["cam", "ins", "ret"];

export type EstimateOverride = Partial<Record<EstimatePart, number>> & { note?: string; by?: string; at?: string };
export type EstimateOverrides = Record<string, EstimateOverride>;

const r0 = (n: number) => Math.round(n || 0);
const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

/** Lay the overrides over an estimate, in place. A tenant's billed months are
 *  the months it pays any recovery (all twelve when it paid none); the override
 *  is the monthly figure in each. The engine's own monthly figure is kept on
 *  `computed` so the table can say what was replaced. */
export function applyEstimateOverrides(est: ReimbursementEstimate, overrides: EstimateOverrides | null | undefined): ReimbursementEstimate {
  if (!overrides || !Object.keys(overrides).length) return est;
  for (const t of est.tenants) {
    const o = overrides[t.unitRef];
    if (!o) continue;
    const any = t.cam.map((_, i) => Math.abs(t.cam[i] || 0) + Math.abs(t.ins[i] || 0) + Math.abs(t.ret[i] || 0) > 0.5);
    const active = any.some(Boolean) ? any : any.map(() => true);
    const n = active.filter(Boolean).length || 1;
    t.computed = { cam: r0(sum(t.cam) / n), ins: r0(sum(t.ins) / n), ret: r0(sum(t.ret) / n) };
    t.overridden = {};
    for (const p of ESTIMATE_PARTS) {
      const v = o[p];
      if (v == null || !Number.isFinite(v)) continue;
      t[p] = active.map((on) => (on ? r0(v) : 0));
      t.overridden[p] = true;
    }
    t.overrideNote = o.note;
    t.camAnnual = r0(sum(t.cam)); t.insAnnual = r0(sum(t.ins)); t.retAnnual = r0(sum(t.ret));
    t.camMonthly = r0(t.camAnnual / 12); t.insMonthly = r0(t.insAnnual / 12); t.retMonthly = r0(t.retAnnual / 12);
  }
  for (const p of ESTIMATE_PARTS) {
    est.monthly[p] = est.monthly[p].map((_, i) => est.tenants.reduce((s, t) => s + (t[p][i] || 0), 0));
  }
  est.totals = { camAnnual: r0(sum(est.monthly.cam)), insAnnual: r0(sum(est.monthly.ins)), retAnnual: r0(sum(est.monthly.ret)) };
  return est;
}
