/**
 * Which tenants make up a recovery line in one month, and what share of its
 * expense pool that recovers. Read by the draft grid's reimbursement cells
 * (hover for the top tenants, click for all of them).
 *
 * The category comes from `basisForLine` — the SAME rule `buildBudgetDraft`
 * uses to put each tenant's CAM / INS / RET months on these lines — so the
 * makeup always sums to what the draft put there. The pool is the
 * reimbursable-expense lines of that category: RE taxes for RET, insurance
 * for INS, everything else for CAM (office recovers insurance inside CAM).
 */
import { basisForLine } from "@/lib/financials/operating-statements/rentCheck";
import type { BudgetDraftSection, TenantRevenueRow } from "./draft";

export type RecoveryCategory = "cam" | "ins" | "ret";

export const CATEGORY_LABEL: Record<RecoveryCategory, string> = { cam: "CAM", ins: "Insurance", ret: "Real estate tax" };

export function recoveryCategory(label: string, mask: string, kind: "retail" | "office" | undefined): RecoveryCategory | null {
  const b = basisForLine(label, mask);
  if (b === "cam") return "cam";
  if (b === "ret") return "ret";
  if (b === "other" && kind !== "office") return "ins";
  return null;
}

const poolCategory = (label: string, kind: "retail" | "office" | undefined): RecoveryCategory =>
  /real\s*estate\s*tax/i.test(label) ? "ret" : /insurance/i.test(label) && kind !== "office" ? "ins" : "cam";

export type RecoveryMakeup = {
  category: RecoveryCategory;
  /** Tenants recovering anything this month, largest first. */
  tenants: { unitRef: string; tenant: string; amount: number }[];
  total: number;
  pool: number;
  poolYear: number;
  totalYear: number;
  /** null when the pool is ~0. */
  ratio: number | null;
  ratioYear: number | null;
};

export function recoveryMakeup(
  cat: RecoveryCategory,
  month: number,
  tenants: TenantRevenueRow[],
  sections: BudgetDraftSection[],
  kind: "retail" | "office" | undefined,
): RecoveryMakeup {
  const part = (t: TenantRevenueRow) => t[cat];
  const rows = tenants
    .map((t) => ({ unitRef: t.unitRef, tenant: t.tenant, amount: part(t)?.[month] || 0 }))
    .filter((r) => Math.abs(r.amount) >= 0.5)
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const totalYear = tenants.reduce((a, t) => a + (part(t) ?? []).reduce((s, v) => s + (v || 0), 0), 0);
  let pool = 0, poolYear = 0;
  for (const sec of sections) {
    if (sec.role !== "reimbursable-expense") continue;
    for (const l of sec.lines) {
      if (poolCategory(l.label, kind) !== cat) continue;
      pool += l.months[month] || 0;
      poolYear += l.total || 0;
    }
  }
  const ratio = Math.abs(pool) >= 0.5 ? (total / pool) * 100 : null;
  const ratioYear = Math.abs(poolYear) >= 0.5 ? (totalYear / poolYear) * 100 : null;
  return { category: cat, tenants: rows, total, pool, poolYear, totalYear, ratio, ratioYear };
}
