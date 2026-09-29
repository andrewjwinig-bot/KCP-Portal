// CAM ESTIMATES BY TENANT — what each tenant is billed a month for CAM,
// insurance and taxes TODAY (the rent roll), what the budget bills them next
// year, and the change. This is where the pushback comes from: a tenant does
// not see a pool or a budget, they see their monthly bill move on January 1st,
// so the table leads with the monthly figure and the change, and carries the
// whole monthly bill (base rent + recoveries) beside it — that is the number
// they will quote back.
//
// "Next" is the escrow the budget sets: each category's budget-year recovery
// averaged over the months it is actually billed (`monthlyEstimate` — a lease
// ending in June is not averaged over twelve), the same figure the ▲
// estimate-jump flag reads, so the two cannot disagree. Next year's rent is
// the first month the tenant pays it (January for a lease in place), which is
// the bill the letter goes out on.
//
// Pure: fed `draft.tenantRevenue`, which already carries today's billing.

import type { TenantRevenueRow } from "./draft";
import { monthlyEstimate, estimateJump, type EstimateJump } from "./estimateJump";

export type Bill = { rent: number; cam: number; ins: number; ret: number; recoveries: number; total: number };

export type EstimateRow = {
  unitRef: string;
  tenant: string;
  sqft: number;
  portion?: "retail" | "office";
  status: TenantRevenueRow["status"];
  method?: TenantRevenueRow["method"];
  /** Today's monthly bill (rent roll). Null for a suite billed nothing today. */
  now: Bill | null;
  /** The budget's monthly bill. */
  next: Bill;
  /** Recoveries only — the part the budget moves. */
  change: number;
  changePct: number | null;
  /** The whole monthly bill. */
  totalChange: number | null;
  /** Set when the jump clears the ▲ floors (15% AND $100/mo). */
  jump: EstimateJump | null;
  /** Rests on a leasing assumption (a renewal, a lease-up) rather than a lease. */
  assumed: boolean;
};

const r0 = (n: number) => Math.round(n || 0);
const firstPaid = (m: number[]) => m.find((v) => Math.abs(v || 0) > 0.5) ?? 0;

export function estimateRows(rows: TenantRevenueRow[]): EstimateRow[] {
  const out: EstimateRow[] = [];
  for (const r of rows) {
    if (!r.tenant && !r.recoveryOnly) continue; // a vacancy owes nothing
    const next: Bill = {
      rent: r0(firstPaid(r.rent)),
      cam: r0(monthlyEstimate(r.cam)), ins: r0(monthlyEstimate(r.ins)), ret: r0(monthlyEstimate(r.ret)),
      recoveries: 0, total: 0,
    };
    next.recoveries = next.cam + next.ins + next.ret;
    next.total = next.rent + next.recoveries;
    const b = r.billing;
    const now: Bill | null = b ? {
      rent: r0(b.rent ?? 0), cam: r0(b.cam), ins: r0(b.ins), ret: r0(b.ret), recoveries: 0, total: 0,
    } : null;
    if (now) { now.recoveries = now.cam + now.ins + now.ret; now.total = now.rent + now.recoveries; }
    // Nothing billed today and nothing budgeted: a gross lease, nothing to say.
    if ((!now || now.recoveries === 0) && next.recoveries === 0) continue;
    const change = next.recoveries - (now?.recoveries ?? 0);
    out.push({
      unitRef: r.unitRef, tenant: r.tenant, sqft: r.sqft, portion: r.portion, status: r.status, method: r.method,
      now, next, change,
      changePct: now && now.recoveries > 0.5 ? (change / now.recoveries) * 100 : null,
      totalChange: now && now.total > 0.5 ? next.total - now.total : null,
      jump: estimateJump(r),
      assumed: r.assumed.some(Boolean),
    });
  }
  return out;
}

export type EstimateTotals = { now: Bill; next: Bill; change: number; changePct: number | null; flagged: number; tenants: number };

export function estimateTotals(rows: EstimateRow[]): EstimateTotals {
  const z = (): Bill => ({ rent: 0, cam: 0, ins: 0, ret: 0, recoveries: 0, total: 0 });
  const now = z(), next = z();
  const keys: (keyof Bill)[] = ["rent", "cam", "ins", "ret", "recoveries", "total"];
  for (const r of rows) for (const k of keys) { now[k] += r.now?.[k] ?? 0; next[k] += r.next[k]; }
  const change = next.recoveries - now.recoveries;
  return { now, next, change, changePct: now.recoveries > 0.5 ? (change / now.recoveries) * 100 : null, flagged: rows.filter((r) => r.jump).length, tenants: rows.length };
}
