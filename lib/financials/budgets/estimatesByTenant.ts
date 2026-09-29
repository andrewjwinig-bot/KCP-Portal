// CAM ESTIMATES BY TENANT — the monthly CAM / INS / RET estimates each tenant
// is billed TODAY (the rent roll), what the budget sets for next year, and WHY
// they moved. This is the review before the estimates are imported into
// Skyline as the tenants' monthly charges, and it is where tenants push back —
// so every change is explained in dollars, not asserted:
//
//   today ──(catch-up)──▶ last reconciliation's actual ──(pool change)──▶ budget
//
// The CATCH-UP is the gap between what the tenant is billed now and what the
// last reconciliation says they actually owed (recon-year amount due ÷ 12): an
// estimate that was set low is being brought up to what the building really
// cost. The POOL CHANGE is the rest — the budget's expense pools against the
// recon year's, through the tenant's own share, admin fee and cap. A tenant
// asking "why is my CAM up $180?" gets "$140 of it is last year's actual cost
// you were under-billed for; $40 is the 2027 budget, CAM pool +6%".
//
// "Budget" is the escrow the budget sets: each category's recovery averaged
// over the months it is billed (`monthlyEstimate` — the same figure the ▲ flag
// reads), or the figure someone keyed as an OVERRIDE (`estimateOverrides.ts`),
// which is also what the budget's recovery lines carry.
//
// Pure: fed `draft.tenantRevenue` and the draft's reimbursement estimate.

import type { TenantRevenueRow } from "./draft";
import type { ReimbursementEstimate } from "./reimbursementEstimate";
import type { SkylineChargeRow } from "@/lib/cam/office/exports";
import { monthlyEstimate, estimateJump, type EstimateJump } from "./estimateJump";
import { ESTIMATE_PARTS, type EstimatePart } from "./estimateOverrides";

export type Estimates = { cam: number; ins: number; ret: number; total: number };

export type WhyPart = {
  part: EstimatePart;
  now: number;
  /** The recon year's actual amount due, a month. Null when there is no recon. */
  recon: number | null;
  next: number;
  /** now → recon actual. */
  catchUp: number | null;
  /** recon actual → budget (the pools, through the tenant's share / cap). */
  budgetChange: number | null;
  /** How the budget pool moved against the recon year's, %. */
  poolPct: number | null;
  overridden: boolean;
  computed?: number;
};

export type EstimateRow = {
  unitRef: string;
  tenant: string;
  sqft: number;
  portion?: "retail" | "office";
  status: TenantRevenueRow["status"];
  method?: TenantRevenueRow["method"];
  /** Billed a month today (rent roll). Null for a suite billed nothing today. */
  now: Estimates | null;
  /** The recon year's actual, a month. Null when the tenant is on no recon. */
  recon: Estimates | null;
  next: Estimates;
  change: number;
  changePct: number | null;
  why: WhyPart[];
  /** One line saying what moved it most. */
  reason: string;
  jump: EstimateJump | null;
  assumed: boolean;
  overridden: boolean;
  overrideNote?: string;
};

const r0 = (n: number) => Math.round(n || 0);
const money = (n: number) => `$${Math.abs(r0(n)).toLocaleString("en-US")}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;
const LABEL: Record<EstimatePart, string> = { cam: "CAM", ins: "INS", ret: "RET" };

export function estimateRows(rows: TenantRevenueRow[], est?: ReimbursementEstimate | null): EstimateRow[] {
  const out: EstimateRow[] = [];
  const reconYear = est?.reconYear;
  for (const r of rows) {
    if (!r.tenant && !r.recoveryOnly) continue; // a vacancy owes nothing
    const next: Estimates = { cam: r0(monthlyEstimate(r.cam)), ins: r0(monthlyEstimate(r.ins)), ret: r0(monthlyEstimate(r.ret)), total: 0 };
    next.total = next.cam + next.ins + next.ret;
    const b = r.billing;
    const now: Estimates | null = b ? { cam: r0(b.cam), ins: r0(b.ins), ret: r0(b.ret), total: 0 } : null;
    if (now) now.total = now.cam + now.ins + now.ret;
    if ((!now || now.total === 0) && next.total === 0) continue; // gross lease: nothing to say

    // The recon year's actual, a month — scaled to a full year where the
    // tenant was there only part of it, as the engine does.
    const m = r.method;
    const reconDue = m && (m.kind === "retail" || m.kind === "office") ? m.recon : null;
    const occ = m?.kind === "retail" && m.reconOcc && m.reconOcc > 0 ? m.reconOcc : 1;
    const recon: Estimates | null = reconDue ? {
      cam: r0(reconDue.cam / occ / 12), ins: r0(reconDue.ins / occ / 12), ret: r0(reconDue.ret / occ / 12), total: 0,
    } : null;
    if (recon) recon.total = recon.cam + recon.ins + recon.ret;

    const why: WhyPart[] = ESTIMATE_PARTS.map((part) => {
      const n = now?.[part] ?? 0, x = next[part], rc = recon ? recon[part] : null;
      const ratio = est?.ratios?.[part];
      return {
        part, now: n, recon: rc, next: x,
        catchUp: rc == null ? null : rc - n,
        budgetChange: rc == null ? null : x - rc,
        poolPct: ratio && Number.isFinite(ratio) ? (ratio - 1) * 100 : null,
        overridden: !!r.overridden?.[part],
        computed: r.computed?.[part],
      };
    }).filter((w) => w.now || w.next || w.recon);

    const change = next.total - (now?.total ?? 0);
    out.push({
      unitRef: r.unitRef, tenant: r.tenant, sqft: r.sqft, portion: r.portion, status: r.status, method: r.method,
      now, recon, next, change,
      changePct: now && now.total > 0.5 ? (change / now.total) * 100 : null,
      why, reason: reasonFor(r, now, recon, next, why, reconYear),
      jump: estimateJump(r),
      assumed: r.assumed.some(Boolean),
      overridden: !!r.overridden && Object.values(r.overridden).some(Boolean),
      overrideNote: r.overrideNote,
    });
  }
  return out;
}

/** The one-line why: the override if there is one; else whichever of the
 *  catch-up and the budget change moved the bill most, in dollars. */
function reasonFor(r: TenantRevenueRow, now: Estimates | null, recon: Estimates | null, next: Estimates, why: WhyPart[], reconYear?: number): string {
  if (r.overridden && Object.values(r.overridden).some(Boolean)) return `Set by hand${r.overrideNote ? ` — ${r.overrideNote}` : ""}`;
  const m = r.method;
  if (m?.kind === "retail" && m.grossLease) return "Gross lease — no recoveries";
  if (!now || now.total === 0) {
    if (m?.kind === "leaseup") return "Lease-up — new estimate from its start month";
    if (m?.kind === "new") return m.assumption === "nnn" ? "Newer lease, on no reconciliation — pro-rata share, NNN" : "Newer lease — base year is the budget year";
    return "Not billed today — first estimate";
  }
  if (next.total === 0) return r.status === "expiring" ? "Lease ends before the year — nothing billed" : "Backed out of the budget — nothing billed";
  if (!recon) return "No reconciliation to compare against";
  const catchUp = recon.total - now.total, budget = next.total - recon.total;
  const big = why.slice().sort((a, b) => Math.abs((b.next - b.now)) - Math.abs((a.next - a.now)))[0];
  const pool = big?.poolPct != null && Math.abs(big.poolPct) >= 0.5 ? ` (${LABEL[big.part]} pool ${big.poolPct >= 0 ? "+" : "−"}${Math.abs(big.poolPct).toFixed(1)}%)` : "";
  const capped = m?.kind === "retail" && m.capPct != null ? ` · CAM capped at ${m.capPct}%` : "";
  if (Math.abs(catchUp) < 1 && Math.abs(budget) < 1) return "Unchanged";
  const parts: string[] = [];
  if (Math.abs(catchUp) >= 1) parts.push(`${signed(catchUp)} to the ${reconYear ?? "last"} actual`);
  if (Math.abs(budget) >= 1) parts.push(`${signed(budget)} budget${pool}`);
  return parts.join(" · ") + capped;
}

export type EstimateTotals = { now: Estimates; recon: Estimates; next: Estimates; change: number; changePct: number | null; flagged: number; tenants: number; overridden: number };

export function estimateTotals(rows: EstimateRow[]): EstimateTotals {
  const z = (): Estimates => ({ cam: 0, ins: 0, ret: 0, total: 0 });
  const now = z(), recon = z(), next = z();
  const keys: (keyof Estimates)[] = ["cam", "ins", "ret", "total"];
  for (const r of rows) for (const k of keys) { now[k] += r.now?.[k] ?? 0; recon[k] += r.recon?.[k] ?? 0; next[k] += r.next[k]; }
  const change = next.total - now.total;
  return {
    now, recon, next, change, changePct: now.total > 0.5 ? (change / now.total) * 100 : null,
    flagged: rows.filter((r) => r.jump).length, tenants: rows.length, overridden: rows.filter((r) => r.overridden).length,
  };
}

/** Skyline bills an estimate in whole $10s (`nextYearEstimate` in the recon's
 *  own export); an override is imported exactly as keyed. */
export const skylineMonthly = (w: WhyPart) => (w.overridden ? r0(w.next) : Math.round(w.next / 10) * 10);

/** The Skyline recurring-charge rows — the SAME format the CAM recon's
 *  Estimates page uploads (`SkylineChargeRow`, unit "<ref>-CU", monthly,
 *  effective 1/1): CAM seq 2, INS seq 3, RET seq 4. Zero rows are dropped by
 *  `chargeRowsToCSV`. */
export function skylineEstimateRows(rows: EstimateRow[], year: number): SkylineChargeRow[] {
  const seq: Record<EstimatePart, number> = { cam: 2, ins: 3, ret: 4 };
  const out: SkylineChargeRow[] = [];
  for (const r of rows) for (const w of r.why) {
    out.push({
      unit: `${r.unitRef}-CU`, seq: seq[w.part], chargeCode: LABEL[w.part],
      chargeDescription: `${year} ${LABEL[w.part]} Estimate`, freq: "M",
      effectiveDate: `${year}-01-01`, endDate: "", amount: skylineMonthly(w),
    });
  }
  return out;
}
