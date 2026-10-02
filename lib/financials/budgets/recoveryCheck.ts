// THE RECOVERY CHECK — a REVIEW, never an adjustment. Every recovery the
// draft carries is revenue, so an inflated one overstates NOI and, once
// imported, over-bills tenants. 4500 is why this exists: $36,226/mo of RET
// estimates (~$435K a year) against a $203,656 tax line, from a ratio built on
// a half-posted reprojection.
//
// The RATIO is the year's recoveries ÷ the budget's own recoverable pool, in
// two groups: RET, and CAM + INS TOGETHER — the recon files liability
// insurance as a CAM line where the budget files it under Insurance, so
// checked apart the two would each read wrong while their sum is right.
//
// NOTHING IS SCALED BACK (owner). It used to cap a group at 100% of its pool,
// but a fully leased NNN centre with admin fees legitimately recovers MORE
// than its pool — admin is charged on top — so a cap cut real revenue off a
// correct budget. The check flags a group above its CEILING for review
// instead: the pool × the higher of the recon year's own ratio and 100% plus
// the highest admin fee on any lease (`ADMIN_ALLOWANCE`, 15%). A 2× RET like
// 4500's still reads well past it.

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
  /** The recon year's own ratio and the ceiling above which the group is
   *  flagged for review. */
  reconRatio: number | null; ceiling: number;
  /** Above the ceiling — review it (nothing is scaled back). */
  over: boolean;
};

export function reconRatioOf(est: Pick<ReimbursementEstimate, "reconCoverage">, parts: ("cam" | "ins" | "ret")[]): number | null {
  const c = est.reconCoverage;
  const pool = c ? pick(c.pool, parts) : 0;
  return c && pool > 0 ? pick(c.due, parts) / pool : null;
}

const recoveredOf = (est: ReimbursementEstimate, parts: ("cam" | "ins" | "ret")[]) => parts.reduce((s, p) => s + sum(est.monthly[p]), 0);

/** The highest admin fee on any lease — how far past 100% of its pool a fully
 *  leased NNN property can legitimately recover. */
export const ADMIN_ALLOWANCE = 0.15;
const ceilingOf = (pool: number, reconRatio: number | null) => pool * Math.max(1 + ADMIN_ALLOWANCE, reconRatio ?? 0);

/** Record the budget's recoverable pools on the estimate, for the check. The
 *  estimates themselves are left exactly as the methodology produced them. */
export function attachPools(est: ReimbursementEstimate, pools: Coverage3): void {
  est.pools = pools;
}

/** The check as it stands (after any hand-set estimates), per group. */
export function recoveryCheck(est: ReimbursementEstimate | null | undefined): GroupCheck[] {
  if (!est?.pools) return [];
  return CHECK_GROUPS.map((g) => {
    const pool = pick(est.pools!, g.parts);
    const recovered = r0(recoveredOf(est, g.parts));
    const rr = reconRatioOf(est, g.parts);
    const ceiling = r0(ceilingOf(pool, rr));
    return {
      group: g.key, label: g.label, recovered, pool: r0(pool), ratio: pool > 0 ? recovered / pool : null,
      reconRatio: rr, ceiling,
      // The check is for real over-billing, not rounding pennies.
      over: pool > 0 && recovered > ceiling + Math.max(25, ceiling * 0.0005),
    };
  }).filter((c) => c.pool > 0 || c.recovered > 0);
}
