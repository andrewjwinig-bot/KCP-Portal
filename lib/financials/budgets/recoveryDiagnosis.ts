// WHY A RECOVERY GROUP READS HIGH — the Recovery Check says CAM + INS (or
// RET) recovers more than its pool explains; this says WHICH TENANTS and WHY,
// so the review starts at the tenant rather than at the total (owner: "call
// out specific tenants paying above their share … or is it from the annual
// recon? just help be smarter").
//
// Each tenant's year (the budget's own recovery, CAM + INS or RET) is set
// against its SQUARE-FOOT share of the pool — pool × SF ÷ the centre's GLA,
// for the months it is billed, plus its admin fee on CAM — and the excess is
// put down to the first cause that fits:
//   • an estimate SET BY HAND;
//   • a tenant HELD at today's billing (on no reconciliation);
//   • a lease-up / new lease ASSUMED;
//   • a STIPULATED share above its SF share (the lease says so — it is in the
//     recon too);
//   • a POOL larger than the budget's (the tenant shares in lines the budget
//     files elsewhere — liability insurance on a CAM line, say);
//   • otherwise, simply above its SF share.
// It also says whether the shares ADD UP past 100%, and whether the recon year
// ran as high — if it did, the pattern comes from the leases, not the budget.
// Pure; nothing is changed.

import type { EstimateRow } from "./estimatesByTenant";
import type { ReimbursementEstimate } from "./reimbursementEstimate";
import { CHECK_GROUPS, type CheckGroup } from "./recoveryCheck";

export type OverCause = "hand" | "held" | "assumed" | "stipulated" | "pool" | "share";

export type OverTenant = {
  unitRef: string; tenant: string; sqft: number;
  /** The budget's year for the group, and the SF share (+ admin) of the pool. */
  recovered: number; fair: number; excess: number;
  cause: OverCause;
  /** One line of plain English, e.g. "stipulated share 18.00% vs 12.10% by SF". */
  detail: string;
};

export type RecoveryDiagnosis = {
  group: CheckGroup;
  /** Tenants above their SF share by $250+ a year, largest first. */
  tenants: OverTenant[];
  /** Their combined excess. */
  excess: number;
  /** The CAM shares added up, % of the pool (retail tenants on a recon). */
  shareSumPct: number | null;
  /** The centre's GLA the SF shares are taken on. */
  gla: number;
};

const r0 = (n: number) => Math.round(n || 0);
const money = (n: number) => `$${Math.abs(r0(n)).toLocaleString("en-US")}`;
const MIN_EXCESS = 250;

export function diagnoseRecovery(rows: EstimateRow[], est: ReimbursementEstimate | null | undefined, group: CheckGroup): RecoveryDiagnosis | null {
  if (!est?.pools) return null;
  const parts = CHECK_GROUPS.find((g) => g.key === group)!.parts;
  const pool = parts.reduce((a, p) => a + (est.pools![p] || 0), 0);
  if (pool <= 0) return null;

  // The GLA: the one the recon divides by, else every suite on the roll.
  const glas = rows.map((r) => (r.method?.kind === "retail" ? r.method.basis?.cam?.gla ?? 0 : 0)).filter((g) => g > 0);
  const gla = glas.length ? Math.max(...glas) : rows.reduce((a, r) => a + (r.sqft || 0), 0);
  if (gla <= 0) return null;

  const out: OverTenant[] = [];
  let shareSum = 0, shareSeen = false;
  for (const r of rows) {
    const ws = r.why.filter((w) => (parts as string[]).includes(w.part));
    const recovered = ws.reduce((a, w) => a + (w.year ?? 0), 0);
    if (recovered <= 0) continue;
    const m = r.method;
    const months = Math.max(0, ...ws.map((w) => w.months || 0)) || 12;
    const sfShare = (r.sqft || 0) / gla;
    const camPool = parts.includes("cam") ? est.pools.cam || 0 : 0;
    const adminPct = m?.kind === "retail" ? m.adminFeePct || 0 : 0;
    const fair = (pool * sfShare + camPool * sfShare * (adminPct / 100)) * (months / 12);
    const excess = recovered - fair;
    if (m?.kind === "retail" && m.basis?.cam && parts.includes("cam")) { shareSum += m.basis.cam.prs; shareSeen = true; }
    if (excess < MIN_EXCESS) continue;

    let cause: OverCause = "share", detail = `${(sfShare * 100).toFixed(2)}% of the GLA by SF`;
    const hand = ws.filter((w) => w.overridden);
    const b = m?.kind === "retail" ? m.basis : undefined;
    const bigPool = parts.map((p) => ({ p, b: b?.[p] })).find((x) => x.b && !x.b.flat && (x.b.expense || 0) > (est.pools![x.p] || 0) * 1.02 + 100);
    const stip = parts.map((p) => ({ p, b: b?.[p] })).find((x) => x.b && !x.b.flat && x.b.prs > sfShare * 100 + 0.25);
    if (hand.length) {
      cause = "hand";
      const set = hand.reduce((a, w) => a + w.next, 0), computed = hand.reduce((a, w) => a + (w.computed ?? w.next), 0);
      detail = `estimate set by hand${r.overrideNote ? ` (${r.overrideNote})` : ""}: ${money(set)}/mo against ${money(computed)} computed`;
    } else if (m?.kind === "new" && m.assumption === "held") {
      cause = "held"; detail = "on no reconciliation — held at what it is billed today";
    } else if (m?.kind === "leaseup" || m?.kind === "new" || r.assumed) {
      cause = "assumed"; detail = m?.kind === "leaseup" ? "lease-up — assumed pro-rata NNN share" : "newer lease — assumed share";
    } else if (stip?.b) {
      cause = "stipulated";
      detail = `${stip.p.toUpperCase()} share ${stip.b.prs.toFixed(2)}% set by the lease vs ${(sfShare * 100).toFixed(2)}% by SF`;
    } else if (bigPool?.b) {
      cause = "pool";
      detail = `its ${bigPool.p.toUpperCase()} is a share of ${money(bigPool.b.expense)}, more than the budget's ${money(est.pools[bigPool.p])} pool`;
    }
    out.push({ unitRef: r.unitRef, tenant: r.tenant, sqft: r.sqft, recovered: r0(recovered), fair: r0(fair), excess: r0(excess), cause, detail });
  }
  out.sort((a, b) => b.excess - a.excess);
  return {
    group, tenants: out, excess: out.reduce((a, t) => a + t.excess, 0),
    shareSumPct: shareSeen ? shareSum : null, gla: r0(gla),
  };
}

/** The headline cause in words: what most of the excess comes from. */
export function mainCause(d: RecoveryDiagnosis): string | null {
  if (!d.tenants.length) return null;
  const by = new Map<OverCause, number>();
  for (const t of d.tenants) by.set(t.cause, (by.get(t.cause) ?? 0) + t.excess);
  const [cause, amt] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = d.excess > 0 ? Math.round((amt / d.excess) * 100) : 0;
  const what: Record<OverCause, string> = {
    hand: "estimates set by hand",
    held: "tenants on no reconciliation, held at today's billing",
    assumed: "assumed shares for lease-ups and newer leases",
    stipulated: "shares the leases set above the tenants' square footage",
    pool: "tenants sharing in a bigger pool than the budget's",
    share: "tenants billed above their square-foot share",
  };
  return `${share}% of it is ${what[cause]}`;
}
