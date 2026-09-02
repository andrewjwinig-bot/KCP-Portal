// Budget draft — auto-seed next year's budget from the data we already have,
// so Nancy/Harry adjust a draft instead of keying from scratch (budget season).
//
// Phase 1, expense baseline: each expense/capital line is seeded from the
// CURRENT year's Reprojection (actual-through blended with budget) grown by one
// editable % — carried month-by-month so seasonality (snow, etc.) is preserved,
// not flattened to an annual average. Debt service carries flat (contractual).
// Revenue + reimbursement lines are carried flat as PLACEHOLDERS here; the
// lease-based revenue projection and CAM/RET estimate sync replace them in the
// next Phase-1 increments.

import "server-only";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { EXPENSE_ROLES, type SectionRole } from "@/lib/financials/operating-statements/types";
import { projectLeaseRevenue, type ExpiringLease, type VacantUnit } from "./leaseRevenue";
import { getLeasingAssumptions } from "./leasingAssumptions";
import { estimateReimbursements, type ReimbursementEstimate } from "./reimbursementEstimate";

/** The revenue line the lease projection replaces — base/rental income. */
const RENTAL_LINE_RE = /rental|rent income|base rent|minimum rent/i;

const EXPENSE_ROLE_SET = new Set<SectionRole>([...EXPENSE_ROLES, "capital"]);
const r0 = (n: number) => Math.round(n);
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);

/** How a drafted line's numbers were produced — shown as a badge so the source
 *  is transparent and the subjective bits are obvious. */
export type DraftSource = "reproj-growth" | "reproj-flat" | "leases" | "cam-estimate";

export type BudgetDraftLine = {
  label: string;
  mask: string;
  /** Drafted 12 monthly amounts (display orientation: positive). */
  months: number[];
  total: number;
  /** Prior-year reprojection full-year total this line was grown from. */
  basisTotal: number;
  source: DraftSource;
};

export type BudgetDraftSection = {
  name: string;
  role: SectionRole;
  lines: BudgetDraftLine[];
  subtotal: number[];
  total: number;
};

export type BudgetDraftRollup = { months: number[]; total: number };

export type BudgetDraft = {
  propertyCode: string;
  propertyName: string;
  budgetYear: number;
  /** The reprojection year the draft was grown from (budgetYear − 1). */
  basisYear: number;
  /** Growth % applied to expenses (e.g. 3 = 3%). */
  growthPct: number;
  sections: BudgetDraftSection[];
  rollups: {
    totalRevenues: BudgetDraftRollup;
    totalOperatingExpenses: BudgetDraftRollup;
    netOperatingIncome: BudgetDraftRollup;
  };
  /** Lease inputs behind the projected rental line — surfaced so leasing
   *  assumptions (renew / vacate / lease-up) are obvious and actionable. */
  leasing?: {
    inPlaceUnits: number;
    projectedRentalTotal: number;
    expiring: ExpiringLease[];
    vacant: VacantUnit[];
    assumptionsApplied: number;
    /** The property code assumptions are saved under (for the save endpoint). */
    propertyCode: string;
  };
  /** DISPLAY-ONLY per-tenant CAM/INS/RET reimbursement estimate (Phase 3). Does
   *  not yet drive the reimbursement lines — surfaced for verification first. */
  reimbursementEstimate?: ReimbursementEstimate;
  /** True when the current-year reprojection couldn't be loaded (no draft). */
  missingBasis?: boolean;
};

function grow(months: number[], factor: number): number[] {
  return months.map((m) => r0((m || 0) * factor));
}
function addInto(acc: number[], add: number[]) {
  for (let i = 0; i < 12; i++) acc[i] += add[i] ?? 0;
}

/** Build a draft FY budget for one property/fund, growing the current-year
 *  reprojection's expense forecast by `growthPct`. Returns `missingBasis` when
 *  there's no reprojection to seed from. */
export async function buildBudgetDraft(key: string, budgetYear: number, growthPct: number): Promise<BudgetDraft | null> {
  const basisYear = budgetYear - 1;
  const loaded = await loadReprojection(key, basisYear);
  if (!loaded) return null;
  const { reprojection: r, meta } = loaded;

  const factor = 1 + (growthPct || 0) / 100;
  const revMonths = new Array(12).fill(0);
  const expMonths = new Array(12).fill(0);

  // Lease-based rental projection for this property (funds fall back to flat),
  // shaped by any saved leasing assumptions (renew / vacate / lease-up).
  const assumptions = await getLeasingAssumptions(budgetYear, [meta.propertyCode]);
  const lease = await projectLeaseRevenue([meta.propertyCode], budgetYear, assumptions);
  // Display-only CAM/INS/RET reimbursement estimate from the real recon engine.
  const reimbursementEstimate = (await estimateReimbursements(meta.propertyCode, budgetYear, growthPct).catch(() => null)) ?? undefined;
  let rentalReplaced = false;

  const sections: BudgetDraftSection[] = r.sections.map((sec) => {
    const isExpense = EXPENSE_ROLE_SET.has(sec.role);
    const isDebt = sec.role === "debt-service";
    const lines: BudgetDraftLine[] = sec.lines.map((l) => {
      // The primary rental line on a revenue section is projected from the
      // rent roll's in-place leases; the first such line wins (avoids catching
      // "rent reimbursement" etc.).
      if (!rentalReplaced && sec.role === "revenue" && lease.hasData && RENTAL_LINE_RE.test(l.label)) {
        rentalReplaced = true;
        return {
          label: l.label, mask: l.mask,
          months: lease.rentalMonthly.map(r0),
          total: r0(sum(lease.rentalMonthly)),
          basisTotal: r0(l.reprojTotal),
          source: "leases",
        };
      }
      // Expenses/capital grow by the assumption; debt + other revenue/
      // reimbursement carry flat (CAM/RET reimbursements refined in Phase 3).
      const grown = isExpense;
      const months = grown ? grow(l.blended, factor) : l.blended.map(r0);
      return {
        label: l.label,
        mask: l.mask,
        months,
        total: r0(sum(months)),
        basisTotal: r0(l.reprojTotal),
        source: grown ? "reproj-growth" : "reproj-flat",
      };
    });
    const subtotal = new Array(12).fill(0);
    for (const l of lines) addInto(subtotal, l.months);
    if (isExpense) addInto(expMonths, subtotal);
    else if (!isDebt) addInto(revMonths, subtotal); // revenue + reimbursement
    return { name: sec.name, role: sec.role, lines, subtotal: subtotal.map(r0), total: r0(sum(subtotal)) };
  });

  const noiMonths = revMonths.map((v, i) => r0(v - expMonths[i]));
  return {
    propertyCode: meta.propertyCode,
    propertyName: meta.propertyName,
    budgetYear,
    basisYear,
    growthPct,
    sections,
    rollups: {
      totalRevenues: { months: revMonths.map(r0), total: r0(sum(revMonths)) },
      totalOperatingExpenses: { months: expMonths.map(r0), total: r0(sum(expMonths)) },
      netOperatingIncome: { months: noiMonths, total: r0(sum(noiMonths)) },
    },
    leasing: lease.hasData ? {
      inPlaceUnits: lease.inPlaceUnits,
      projectedRentalTotal: lease.rentalTotal,
      expiring: lease.expiring,
      vacant: lease.vacant,
      assumptionsApplied: lease.assumptionsApplied,
      propertyCode: meta.propertyCode,
    } : undefined,
    reimbursementEstimate,
  };
}
