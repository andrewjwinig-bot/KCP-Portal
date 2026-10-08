// WHAT A RAISE IS MEASURED AGAINST — each building's budget, for the payroll
// budget's Test a Raise. Per property: budgeted revenue, NOI, cash flow after
// debt service, and the RECOVERY RATE the maintenance share of a raise is
// netted by.
//
// The budget read is the payroll year's (else the one in force before it —
// `pickBudgetYear`), from the ONE preferred workbook per property, exactly as
// every other budget reader does.
//
// Recovery rate = the budget's reimbursement revenue ÷ its reimbursable
// expenses, capped at 100%. It is an ESTIMATE of how much of one more dollar
// of a recoverable expense (Maintenance Salaries 6030-8502) tenants pay back:
// right for a NNN centre (each occupied tenant pays its share of every
// dollar), rough for an office building on base-year stops (only tenants over
// base pay any of it). The card says so.

import type { BudgetWorkbook, PropertyBudget } from "./types";
import { pickBudgetYear, preferredWorkbooks } from "./inForce";

export type BuildingContext = {
  code: string;
  year: number;
  revenue: number | null;
  noi: number | null;
  cashFlowAfterDebt: number | null;
  /** 0–1: share of a recoverable dollar tenants reimburse. */
  recoveryRate: number;
};

const roll = (p: PropertyBudget, re: RegExp) => {
  const r = p.rollups.find((x) => re.test(x.name.trim()));
  return r && Number.isFinite(r.total) ? r.total : null;
};

function sectionTotal(p: PropertyBudget, test: (name: string) => boolean): number {
  let total = 0;
  for (const s of p.sections) {
    if (!test(s.name.trim())) continue;
    const sub = s.lines.find((l) => l.isSubtotal && /^(sub-?)?total/i.test(l.label.trim()));
    total += sub ? sub.total : s.lines.filter((l) => !l.isSubtotal && l.glAccount).reduce((a, l) => a + (l.total || 0), 0);
  }
  return total;
}

/** Recovery rate off one property's budget (pure — pinned by the test). */
export function recoveryRateOf(p: PropertyBudget): number {
  const recovered = sectionTotal(p, (n) => /^reimbursements?$/i.test(n));
  const pool = sectionTotal(p, (n) => /reimbursable/i.test(n) && !/non-?\s*reimbursable/i.test(n));
  if (!(pool > 0) || !(recovered > 0)) return 0;
  return Math.min(1, recovered / pool);
}

export function buildingContext(p: PropertyBudget, year: number): BuildingContext {
  return {
    code: p.propertyCode.toUpperCase(),
    year,
    revenue: roll(p, /^total revenues?$/i),
    noi: roll(p, /^net operating income$/i),
    cashFlowAfterDebt: roll(p, /^cash flow after debt/i),
    recoveryRate: recoveryRateOf(p),
  };
}

/** Each property's context for `year`, from the stored workbooks. */
export function payrollContextFrom(workbooks: BudgetWorkbook[], year: number): Record<string, BuildingContext> {
  const wbs = preferredWorkbooks(workbooks);
  const years = new Map<string, number[]>();
  for (const wb of wbs) for (const p of wb.properties) {
    const c = p.propertyCode.toUpperCase();
    years.set(c, [...(years.get(c) ?? []), wb.year]);
  }
  const out: Record<string, BuildingContext> = {};
  for (const wb of wbs) for (const p of wb.properties) {
    const c = p.propertyCode.toUpperCase();
    if (c === "CONSOLIDATED" || out[c] || wb.year !== pickBudgetYear(years.get(c) ?? [], year)) continue;
    out[c] = buildingContext(p, wb.year);
  }
  return out;
}
