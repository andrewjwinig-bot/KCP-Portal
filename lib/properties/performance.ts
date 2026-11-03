// THE PROPERTY DASHBOARD'S PERFORMANCE PANEL (owner: "each property page should
// be a dashboard for that respective property … a graph of how were doing this
// year vs budget … like the command center for the property").
//
// Pure: everything is read off the property's REPROJECTION (actual to date +
// budget for the rest — `lib/financials/reprojections`), so the dashboard says
// exactly what the Reprojections and Operating Statements pages say.

import type { Reprojection, ReprojTotals } from "@/lib/financials/reprojections/compute";
import { EXPENSE_ROLES } from "@/lib/financials/operating-statements/types";

export type PerfTotals = {
  actual: number[];
  budget: number[];
  /** Actual through `through`, budget after — the reprojection. */
  blended: number[];
  ytdActual: number;
  ytdBudget: number;
  fullYearReproj: number;
  fullYearBudget: number;
};

export type PerfLine = {
  section: string;
  label: string;
  kind: "revenue" | "expense";
  ytdActual: number;
  ytdBudget: number;
  /** FAVORABLE-signed: more revenue or less expense than budget is positive. */
  variance: number;
};

export type PropertyPerformance = {
  key: string;
  year: number;
  /** Months of actuals (0–12). */
  through: number;
  hasBudget: boolean;
  revenue: PerfTotals;
  opex: PerfTotals;
  noi: PerfTotals;
  /** Debt service and cash flow after it, where the property carries debt. */
  cashFlow: PerfTotals | null;
  /** Every operating line, largest YTD variance first. */
  lines: PerfLine[];
};

const r0 = (n: number) => Math.round(n);
const sumTo = (a: number[], n: number) => a.slice(0, n).reduce((t, v) => t + (v || 0), 0);
const sum = (a: number[]) => a.reduce((t, v) => t + (v || 0), 0);

function totalsOf(t: ReprojTotals, through: number): PerfTotals {
  return {
    actual: t.actual.map(r0), budget: t.budget.map(r0), blended: t.blended.map(r0),
    ytdActual: r0(sumTo(t.actual, through)), ytdBudget: r0(sumTo(t.budget, through)),
    fullYearReproj: r0(sum(t.blended)), fullYearBudget: r0(sum(t.budget)),
  };
}

const EXPENSE = new Set<string>(EXPENSE_ROLES);

export function performanceOf(key: string, r: Reprojection): PropertyPerformance {
  const through = Math.max(0, Math.min(12, r.actualThroughMonth || 0));
  const lines: PerfLine[] = [];
  for (const sec of r.sections) {
    const kind = sec.role === "revenue" || sec.role === "reimbursement" ? "revenue" : EXPENSE.has(sec.role) ? "expense" : null;
    if (!kind) continue;
    for (const l of sec.lines) {
      const ytdActual = r0(sumTo(l.actual, through)), ytdBudget = r0(sumTo(l.budget, through));
      if (!ytdActual && !ytdBudget) continue;
      lines.push({ section: sec.name, label: l.label, kind, ytdActual, ytdBudget,
        variance: kind === "revenue" ? ytdActual - ytdBudget : ytdBudget - ytdActual });
    }
  }
  lines.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const debt = r.rollups.totalDebtService;
  const hasDebt = debt.actual.some((v) => Math.abs(v) >= 1) || debt.budget.some((v) => Math.abs(v) >= 1);
  return {
    key, year: r.year, through,
    hasBudget: r.rollups.netOperatingIncome.budget.some((v) => Math.abs(v) >= 1),
    revenue: totalsOf(r.rollups.totalRevenues, through),
    opex: totalsOf(r.rollups.totalOperatingExpenses, through),
    noi: totalsOf(r.rollups.netOperatingIncome, through),
    cashFlow: hasDebt ? totalsOf(r.rollups.cashFlowAfterDebtService, through) : null,
    lines,
  };
}

/** Running total — the cumulative NOI line. */
export const cumulative = (a: number[]) => { let t = 0; return a.map((v) => (t += v || 0)); };
