// What makes up a tenant's budgeted CAM / INS / RET estimate, expense by
// expense, beside the recon year, and from it the expenses DRIVING the change
// from what the tenant is billed today (the WHY column). Pure; read by
// `estimatesByTenant.ts` (the one-line why) and the set-by-hand modal.

import type { EstimateRow, WhyPart } from "./estimatesByTenant";
import type { EstimatePart } from "./estimateOverrides";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const LABEL: Record<EstimatePart, string> = { cam: "CAM", ins: "INS", ret: "RET" };

type BPart = EstimatePart;
export type BRow = {
  key: string; label: string; part: BPart;
  /** The expense line: the recon year's actual and this budget. */
  priorPool: number | null; pool: number | null;
  /** The tenant's part of it, a year: on this budget, and on the recon year's actual. */
  annual: number; prior: number | null;
  struck?: boolean; note?: string;
};

/** Every expense behind the tenant's computed estimate, as its own row: each
 *  CAM line's slice of the pool at the tenant's share, the admin fee, insurance
 *  and taxes — beside the same line in the recon year, so the change in the
 *  estimate can be explained expense by expense. Both columns add to the
 *  totals (a recovery-ratio trim, or the recon's cap / occupancy, is its own
 *  row). */
export function breakdownRows(m: EstimateRow["method"], why: WhyPart[]): BRow[] {
  const out: BRow[] = [];
  for (const p of ["cam", "ins", "ret"] as const) {
    const w = why.find((x) => x.part === p);
    if (!w) continue;
    const final = w.annual ? w.annual : w.year ?? (w.computed ?? w.next) * (w.months || 12);
    const priorTotal = w.recon != null ? w.recon * 12 : null;
    let sum = 0, priorSum = 0;
    const b = m?.kind === "retail" ? m.basis?.[p] : undefined;
    if (b?.lines?.length) {
      const billed = b.lines.filter((l) => l.billed);
      const tot = billed.reduce((a, l) => a + l.budget, 0);
      const scale = tot > 0 ? b.expense / tot : 0;
      const share = b.prs / 100;
      for (const l of b.lines) {
        const v = l.billed ? l.budget * scale * share : 0;
        const pv = l.billed ? l.actual * share : 0;
        sum += v; priorSum += pv;
        out.push({ key: `${p}:${l.label}`, label: `${l.label}${l.from === "ratio" ? " *" : ""}`, part: p,
          priorPool: l.actual, pool: l.budget, annual: v, prior: pv,
          struck: !l.billed, note: !l.billed ? "Excluded by lease" : undefined });
      }
      if (b.adminPct && (Math.abs(b.admin) >= 0.5)) {
        const priorBase = billed.filter((l) => !l.adminExcluded).reduce((a, l) => a + l.actual, 0);
        const pv = (b.adminPct / 100) * share * priorBase;
        sum += b.admin; priorSum += pv;
        out.push({ key: `${p}:admin`, label: `Administrative fee ${b.adminPct}%`, part: p,
          priorPool: null, pool: null, annual: b.admin, prior: pv,
          note: billed.some((l) => l.adminExcluded) ? "Not charged on every line" : undefined });
      }
      if (b.capped) out.push({ key: `${p}:cap`, label: "Controllable CAM cap", part: p, priorPool: null, pool: b.expense - tot, annual: 0, prior: null, note: "Already taken off each line above" });
    } else if (m?.kind === "office" && p === "cam" && m.lines?.length) {
      for (const l of m.lines) {
        const v = l.over > 0 ? (l.over * m.proRataPct) / 100 : 0;
        sum += v;
        out.push({ key: `${p}:${l.label}`, label: `${l.label}${l.fromLine ? "" : " *"}`, part: p,
          priorPool: null, pool: l.budget, annual: v, prior: null, struck: v === 0,
          note: v === 0 ? `At or under its ${m.baseYear ?? "base-year"} base of ${money0(l.base)}` : `Over its base of ${money0(l.base)} by ${money0(l.over)}` });
      }
      // Office recons are not kept line by line, so last year is one row.
      if (priorTotal != null) {
        out.push({ key: `${p}:prior`, label: "Last reconciliation (not split by line)", part: p, priorPool: null, pool: null, annual: 0, prior: priorTotal });
        priorSum = priorTotal;
      }
    } else if (final || priorTotal) {
      const label = p === "cam" ? "Common area maintenance" : p === "ins" ? "Property insurance" : "Real estate taxes";
      out.push({ key: `${p}:all`, label, part: p, priorPool: b?.actual ?? null, pool: b ? b.expense : null, annual: final, prior: priorTotal,
        note: b?.flat ? "Own parcel — a fixed amount" : w.annual ? "Collected at reconciliation, not monthly" : undefined });
      sum = final; priorSum = priorTotal ?? 0;
    }
    if (Math.abs(final - sum) >= 1) out.push({ key: `${p}:check`, label: `${LABEL[p]} recovery-ratio check`, part: p, priorPool: null, pool: null, annual: final - sum, prior: 0 });
    // What the recon billed beyond its lines at that share: cap, part year, rounding.
    if (priorTotal != null && Math.abs(priorTotal - priorSum) >= 1)
      out.push({ key: `${p}:recon-adj`, label: `${LABEL[p]} cap, occupancy & rounding (last recon)`, part: p, priorPool: null, pool: null, annual: 0, prior: priorTotal - priorSum });
  }
  return out;
}

export type Driver = {
  label: string; part: EstimatePart;
  /** The change it makes to the monthly bill against today. */
  monthly: number;
  /** Left out of today's estimate (snow), so the whole line is new. */
  notInToday?: boolean;
  /** The part of the catch-up (today to the recon actual) it accounts for, a month. */
  catchUp?: number;
  /** The expense's own change against the recon year, %. */
  poolPct?: number | null;
};

const SNOW = /snow/i;

/** The expenses moving a tenant's monthly bill from today to the budget,
 *  biggest first. The bill moves in two steps: today to the recon year's
 *  actual (the catch-up, which no ledger splits by line) and the recon year to
 *  the budget (split line by line here). One catch-up IS read: when today's
 *  CAM sits short of the recon actual by about the tenant's share of SNOW, the
 *  estimate was set without snow, so the whole snow line is the driver. */
export function expenseDrivers(m: EstimateRow["method"], why: WhyPart[]): Driver[] {
  const rows = breakdownRows(m, why);
  const months = (p: EstimatePart) => why.find((w) => w.part === p)?.months || 12;
  const out: Driver[] = [];
  const cam = why.find((w) => w.part === "cam");
  const snow = rows.find((r) => r.part === "cam" && SNOW.test(r.label) && !r.struck && r.prior != null);
  let snowOut = false;
  if (cam && cam.catchUp != null && snow) {
    const snowPrior = (snow.prior ?? 0) / 12;
    // Today short of the recon actual by roughly the snow share (60–160%).
    if (cam.catchUp > 5 && snowPrior >= 0.6 * cam.catchUp && snowPrior <= 1.6 * cam.catchUp) snowOut = true;
  }
  for (const r of rows) {
    if (r.prior == null || r.struck) continue;
    if (/cap, occupancy|recovery-ratio/.test(r.label)) continue;
    const isSnow = snowOut && r === snow;
    const monthly = isSnow ? r.annual / months(r.part) : r.annual / months(r.part) - r.prior / 12;
    if (Math.abs(monthly) < 1) continue;
    const pct = r.priorPool && r.pool != null && r.priorPool > 0 ? ((r.pool - r.priorPool) / r.priorPool) * 100 : null;
    out.push({ label: r.label.replace(/ \*$/, ""), part: r.part, monthly, notInToday: isSnow || undefined, ...(isSnow ? { catchUp: (r.prior ?? 0) / 12 } : {}), poolPct: pct });
  }
  return out.sort((a, b) => Math.abs(b.monthly) - Math.abs(a.monthly));
}

/** "Snow Removal +$140 (not in today's estimate) · Real Estate Taxes +$30,
 *  line up 6% · …": the drivers moving the bill the SAME way as the change,
 *  up to three, each at least $5 a month. */
export function driverText(drivers: Driver[], change: number): string | null {
  const dir = Math.sign(change);
  const pick = drivers.filter((d) => Math.sign(d.monthly) === dir && Math.abs(d.monthly) >= 5).slice(0, 3);
  if (!pick.length) return null;
  const sgn = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
  return pick.map((d) => {
    if (d.notInToday) return `${d.label} ${sgn(d.monthly)} (not in today's estimate)`;
    const pct = d.poolPct != null && Math.abs(d.poolPct) >= 1 ? `, line ${d.poolPct >= 0 ? "up" : "down"} ${Math.abs(d.poolPct).toFixed(0)}%` : "";
    return `${d.label} ${sgn(d.monthly)}${pct}`;
  }).join(" · ");
}
