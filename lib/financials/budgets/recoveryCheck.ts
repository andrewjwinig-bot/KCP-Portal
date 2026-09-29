// THE RECOVERY CHECK — tenants can never be budgeted to recover more than the
// expenses they are recovering. Every recovery the draft carries is revenue,
// so an inflated one overstates NOI and, once imported, over-bills tenants.
// 4500 is why this exists: $36,226/mo of RET estimates (~$435K a year) against
// a $203,656 tax line, from a ratio built on a half-posted reprojection.
//
// The RATIO is the year's recoveries ÷ the budget's own recoverable pool, in
// two groups: RET, and CAM + INS TOGETHER — the recon files liability
// insurance as a CAM line where the budget files it under Insurance, so
// checked apart the two would each read wrong while their sum is right.
// The CEILING is 100% of the pool, or the RECON year's own ratio where that
// was higher (admin fees legitimately take CAM past 100%). Above it, every
// tenant in the group is scaled back pro rata — the shares between them are
// the methodology's and stay — and it is recorded (`capped`) so the card says
// so. Estimates set by hand are laid on AFTER this and never capped; the check
// flags them instead.

import type { ReimbursementEstimate, Coverage3 } from "./reimbursementEstimate";

export type CheckGroup = "camIns" | "ret";
export const CHECK_GROUPS: { key: CheckGroup; label: string; parts: ("cam" | "ins" | "ret")[] }[] = [
  { key: "camIns", label: "CAM + INS", parts: ["cam", "ins"] },
  { key: "ret", label: "RET", parts: ["ret"] },
];
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const r0 = (n: number) => Math.round(n || 0);
const pick = (c: Coverage3, parts: ("cam" | "ins" | "ret")[]) => parts.reduce((s, p) => s + (c[p] || 0), 0);

export type GroupCheck = {
  group: CheckGroup; label: string;
  /** The year's recoveries, the budget pool, and their ratio. */
  recovered: number; pool: number; ratio: number | null;
  /** The recon year's own ratio, the ceiling it allows, and whether the
   *  engine had to scale the group back to it. */
  reconRatio: number | null; ceiling: number;
  capped?: { before: number };
  /** Over the ceiling as it stands (a hand-set estimate can put it there). */
  over: boolean;
};

export function reconRatioOf(est: Pick<ReimbursementEstimate, "reconCoverage">, parts: ("cam" | "ins" | "ret")[]): number | null {
  const c = est.reconCoverage;
  const pool = c ? pick(c.pool, parts) : 0;
  return c && pool > 0 ? pick(c.due, parts) / pool : null;
}

const recoveredOf = (est: ReimbursementEstimate, parts: ("cam" | "ins" | "ret")[]) => parts.reduce((s, p) => s + sum(est.monthly[p]), 0);

/** Scale any group over its ceiling back to it, in place. */
export function capRecoveries(est: ReimbursementEstimate, pools: Coverage3): void {
  est.pools = pools;
  const capped: NonNullable<ReimbursementEstimate["capped"]> = {};
  for (const g of CHECK_GROUPS) {
    const pool = pick(pools, g.parts);
    if (!(pool > 0)) continue;
    const ceiling = pool * Math.max(1, reconRatioOf(est, g.parts) ?? 1);
    const before = recoveredOf(est, g.parts);
    if (before <= ceiling + 1) continue;
    const f = ceiling / before;
    for (const t of est.tenants) for (const k of g.parts) {
      t[k] = t[k].map((v) => r0(v * f));
      const annual = r0(sum(t[k]));
      if (k === "cam") { t.camAnnual = annual; t.camMonthly = r0(annual / 12); }
      if (k === "ins") { t.insAnnual = annual; t.insMonthly = r0(annual / 12); }
      if (k === "ret") { t.retAnnual = annual; t.retMonthly = r0(annual / 12); }
    }
    for (const k of g.parts) est.monthly[k] = est.monthly[k].map((_, i) => est.tenants.reduce((s, t) => s + (t[k][i] || 0), 0));
    capped[g.key] = { before: r0(before), after: r0(recoveredOf(est, g.parts)), pool: r0(pool), ceiling: r0(ceiling) };
  }
  if (Object.keys(capped).length) {
    est.totals = { camAnnual: r0(sum(est.monthly.cam)), insAnnual: r0(sum(est.monthly.ins)), retAnnual: r0(sum(est.monthly.ret)) };
    est.capped = capped;
  }
}

/** The check as it stands (after any hand-set estimates), per group. */
export function recoveryCheck(est: ReimbursementEstimate | null | undefined): GroupCheck[] {
  if (!est?.pools) return [];
  return CHECK_GROUPS.map((g) => {
    const pool = pick(est.pools!, g.parts);
    const recovered = r0(recoveredOf(est, g.parts));
    const rr = reconRatioOf(est, g.parts);
    const ceiling = r0(pool * Math.max(1, rr ?? 1));
    const c = est.capped?.[g.key];
    return {
      group: g.key, label: g.label, recovered, pool: r0(pool), ratio: pool > 0 ? recovered / pool : null,
      reconRatio: rr, ceiling, ...(c ? { capped: { before: c.before } } : {}),
      // Whole-dollar rounding per tenant-month can leave a capped group a few
      // dollars over; the check is for real over-billing, not pennies.
      over: pool > 0 && recovered > ceiling + Math.max(25, ceiling * 0.0005),
    };
  }).filter((c) => c.pool > 0 || c.recovered > 0);
}
