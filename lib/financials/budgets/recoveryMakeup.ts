/**
 * Which tenants make up a recovery line in one month, and what share of its
 * expense pool the YEAR recovers. Read by the draft grid's reimbursement cells
 * (hover for the top tenants, click for all of them).
 *
 * THERE IS NO MONTHLY RATIO, deliberately. A month's recovery is a flat
 * estimate — the year's figure ÷ the months billed — while a month's expense
 * is whatever posted that month (taxes in February, snow in winter). Their
 * quotient swings from 20% to 400% on timing alone and says nothing about
 * whether the budget recovers the right amount; the owner found it
 * misleading. Only the year's ratio is a real comparison, and beside it the
 * LEASED SHARE — what tenants would recover paying exactly their SF share for
 * the months they pay — which is the bar a NNN centre's ratio should sit near.
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
  /** Tenants recovering anything this month, largest first — with their
   *  year, and the share of the year's pool that is against their SF share. */
  tenants: { unitRef: string; tenant: string; amount: number; year: number; poolShare: number | null; sfShare: number | null }[];
  total: number;
  poolYear: number;
  totalYear: number;
  /** The year's recoveries ÷ the year's pool, %. null when the pool is ~0. */
  ratioYear: number | null;
  /** The year's average leased SF ÷ total SF, % (a suite is leased in a month
   *  it pays rent). null without suite areas. */
  leasedShare: number | null;
};

/** A suite's share of the building's SF over the year, % — its SF ÷ total SF
 *  × the months it pays rent ÷ 12. */
export function sfShares(tenants: TenantRevenueRow[]): { byUnit: Map<string, number>; leased: number | null } {
  const suites = tenants.filter((t) => !t.recoveryOnly && t.sqft > 0);
  const total = suites.reduce((a, t) => a + t.sqft, 0);
  const byUnit = new Map<string, number>();
  if (!(total > 0)) return { byUnit, leased: null };
  let leased = 0;
  for (const t of suites) {
    const months = t.rent.filter((v) => (v || 0) > 0.5).length;
    const share = (t.sqft / total) * (months / 12) * 100;
    byUnit.set(t.unitRef, share);
    leased += share;
  }
  return { byUnit, leased };
}

export function recoveryMakeup(
  cat: RecoveryCategory,
  month: number,
  tenants: TenantRevenueRow[],
  sections: BudgetDraftSection[],
  kind: "retail" | "office" | undefined,
): RecoveryMakeup {
  const part = (t: TenantRevenueRow) => t[cat];
  const yearOf = (t: TenantRevenueRow) => (part(t) ?? []).reduce((s, v) => s + (v || 0), 0);
  let poolYear = 0;
  for (const sec of sections) {
    if (sec.role !== "reimbursable-expense") continue;
    for (const l of sec.lines) if (poolCategory(l.label, kind) === cat) poolYear += l.total || 0;
  }
  const hasPool = Math.abs(poolYear) >= 0.5;
  const { byUnit, leased } = sfShares(tenants);
  const rows = tenants
    .map((t) => {
      const year = yearOf(t);
      return {
        unitRef: t.unitRef, tenant: t.tenant, amount: part(t)?.[month] || 0, year,
        poolShare: hasPool ? (year / poolYear) * 100 : null,
        sfShare: byUnit.get(t.unitRef) ?? null,
      };
    })
    .filter((r) => Math.abs(r.amount) >= 0.5)
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const totalYear = tenants.reduce((a, t) => a + yearOf(t), 0);
  const ratioYear = hasPool ? (totalYear / poolYear) * 100 : null;
  return { category: cat, tenants: rows, total, poolYear, totalYear, ratioYear, leasedShare: leased };
}
