// RETAIL CAM, LINE BY LINE — the reconciliation's own formula run on the
// budget year's expense lines, the way the owner's estimate worksheets are
// built (Wakefern at 4500 is the reference):
//
//   each CAM line: 2025 actual · 2026 projected · 2027 BUDGETED
//   → the lines the tenant is billed for (its exclusions struck)
//   → the controllable-CAM cap, grown to the budget year
//   → × the tenant's PRS                       = tenant CAM expense
//   → admin fee % × PRS × the pool less its admin-excluded lines
//   → total ÷ 12                               = estimated monthly CAM
//
// It REPLACED "recon due × (budget pool ÷ reprojected pool)", which applied the
// 2026 → 2027 change to the 2025 actual: snow at 51K → 87K → 50K read as a 43%
// cut to 2025's 51K, and every line's own swing was averaged away.
//
// Each recon line takes ITS OWN budget line: by GL account (a sub-line, or a
// line built from that account), else by name; Liability Insurance from the
// Insurance line's Liability bucket. A line with no budget to read keeps the
// old ratio and says so (`from: "ratio"`). Pure.

import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";

export type BudgetLineRef = {
  label: string;
  mask: string;
  glAccounts?: string[];
  total: number;
  basisTotal: number;
  subLines?: { account: string; total: number; basisTotal: number }[];
};

export type CamLineSource = "account" | "label" | "liability" | "ratio";
export type CamLineBudget = { budget: number; projected: number; from: CamLineSource };

export type RetailCamLineOut = {
  label: string;
  glAccount: string;
  /** The recon year's actual (the reconciliation's own figure). */
  actual: number;
  /** This year's reprojection, where the budget line carries one. */
  projected: number | null;
  budget: number;
  from: CamLineSource;
  /** False = the tenant is excluded from this line (struck on the worksheet). */
  billed: boolean;
  adminExcluded: boolean;
};

export type RetailCamResult = {
  /** The pool the tenant shares in (billed lines, after the cap). */
  pool: number;
  share: number;
  admin: number;
  /** The pool the admin fee is taken on (billed less admin-excluded lines). */
  adminBase: number;
  year: number;
  capped: boolean;
  capAmount: number | null;
  lines: RetailCamLineOut[];
};

const r0 = (n: number) => Math.round(n);
const ACCT = /^\d{4}-\d{4}$/;
const norm = (s: string) => String(s ?? "").toLowerCase()
  .replace(/\(.*?\)/g, " ").replace(/&/g, " and ").replace(/\//g, " and ")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/** A lookup from a reconciliation CAM line to its budget-year line. */
export function camLineBudgetResolver(lines: BudgetLineRef[]) {
  return (rl: { glAccount: string; label: string }): CamLineBudget | null => {
    // Liability insurance sits inside the one Insurance line (6510-*) with the
    // property premium; its own figure is that line's Liability bucket.
    if (/liab/i.test(rl.label)) {
      for (const l of lines) {
        if (!/insurance/i.test(l.label)) continue;
        const b = l.subLines?.find((s) => /^liability$/i.test(s.account));
        if (b && b.total > 0) return { budget: r0(b.total), projected: r0(b.basisTotal), from: "liability" };
      }
    }
    const spec = String(rl.glAccount ?? "").trim();
    const masks = spec && spec !== "—" ? spec.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (masks.length) {
      let budget = 0, projected = 0, hit = false;
      for (const l of lines) {
        const subs = (l.subLines ?? []).filter((s) => ACCT.test(s.account));
        if (subs.length) {
          for (const s of subs) if (masks.some((m) => accountMatchesMask(m, s.account))) { budget += s.total; projected += s.basisTotal; hit = true; }
          continue;
        }
        const accts = (l.glAccounts ?? []).filter((a) => ACCT.test(a));
        const own = accts.length ? accts : ACCT.test(l.mask.trim()) ? [l.mask.trim()] : [];
        if (own.length && own.every((a) => masks.some((m) => accountMatchesMask(m, a)))) { budget += l.total; projected += l.basisTotal; hit = true; }
      }
      if (hit) return { budget: r0(budget), projected: r0(projected), from: "account" };
    }
    const key = norm(rl.label);
    const byLabel = lines.find((l) => norm(l.label) === key);
    if (byLabel) return { budget: r0(byLabel.total), projected: r0(byLabel.basisTotal), from: "label" };
    return null;
  };
}

/** One tenant's budget-year CAM, from the reconciliation's schedule (lines
 *  and exclusions), its PRS / admin fee / cap and the budget's lines. */
export function retailCamBudget(
  t: {
    camSchedule: { glAccount: string; label: string; amount: number; billed: boolean; nonControllable: boolean }[];
    adminExcludedLabels: string[];
    camPrs: number;
    adminFeePct: number;
    grossLease?: boolean;
    camCap?: { priorControllable: number; growthPct: number };
  },
  resolve: (rl: { glAccount: string; label: string }) => CamLineBudget | null,
  /** A line with no budget to read: its actual × this. */
  fallback: { cam: number; ins: number },
  /** Years the cap compounds over from its prior controllable figure. */
  capYears: number,
): RetailCamResult {
  const adminEx = new Set((t.adminExcludedLabels ?? []).map((s) => s.trim().toLowerCase()));
  const lines: RetailCamLineOut[] = t.camSchedule.map((l) => {
    const b = resolve(l);
    const budget = b ? b.budget : r0(l.amount * (/insurance/i.test(l.label) ? fallback.ins : fallback.cam));
    return {
      label: l.label, glAccount: l.glAccount, actual: r0(l.amount),
      projected: b ? b.projected : null, budget, from: b ? b.from : "ratio",
      billed: l.billed, adminExcluded: adminEx.has(l.label.trim().toLowerCase()),
    };
  });
  const billed = lines.filter((l) => l.billed);
  const full = billed.reduce((a, l) => a + l.budget, 0);
  let pool = full, capped = false, capAmount: number | null = null;
  if (t.camCap) {
    const nc = new Set(t.camSchedule.filter((l) => l.nonControllable).map((l) => l.label));
    const unc = billed.filter((l) => nc.has(l.label)).reduce((a, l) => a + l.budget, 0);
    capAmount = r0(t.camCap.priorControllable * Math.pow(1 + t.camCap.growthPct / 100, capYears));
    const controllable = full - unc;
    if (controllable > capAmount) { pool = capAmount + unc; capped = true; }
  }
  if (t.grossLease) return { pool: r0(pool), share: 0, admin: 0, adminBase: 0, year: 0, capped, capAmount, lines };
  const prs = (t.camPrs || 0) / 100;
  const share = r0(pool * prs);
  const adminBase = Math.max(0, pool - billed.filter((l) => l.adminExcluded).reduce((a, l) => a + l.budget, 0));
  const admin = r0(((t.adminFeePct || 0) / 100) * prs * adminBase);
  return { pool: r0(pool), share, admin, adminBase: r0(adminBase), year: share + admin, capped, capAmount, lines };
}
