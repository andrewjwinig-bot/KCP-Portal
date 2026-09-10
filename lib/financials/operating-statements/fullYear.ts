// Full-Year operating statement: 12 monthly columns + a full-year total, built
// from the SAME engine as the single-month statement (one computeStatement per
// month + period-12 for the year figures). Shared by the page route (the
// on-screen "Full Year" grid) and the Excel/PDF download, so both agree.

import "server-only";
import { computeStatement, type ComputeInput } from "./compute";
import { summaryForPeriod } from "./glParser";
import { getMapping } from "./mappingStore";
import { listFullGls, getNotesBundle, type StoredGl } from "./statementStore";
import { assembleGls } from "./glAssemble";
import { resolvePropertyBudget, makeBudgetLookup } from "./budgetCrosswalk";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { SectionRole, PropertyStatement } from "./types";
import type { StatementMeta } from "./statementExport";

export type FullYearCell = { monthly: number[]; total: number; budget: number | null; variance: number | null };
export type FullYearLine = { label: string; mask: string; accounts: string[]; monthly: number[]; total: number; budget: number | null; variance: number | null };
export type FullYearSection = {
  name: string;
  role: SectionRole;
  lines: FullYearLine[];
  subtotalMonthly: number[];
  subtotalTotal: number;
  subtotalBudget: number | null;
  subtotalVariance: number | null;
};
export type FullYearRollupKey =
  | "totalRevenues" | "totalOperatingExpenses" | "netOperatingIncome"
  | "cashFlowBeforeDebtService" | "totalDebtService" | "cashFlowAfterDebtService";
export type FullYearPayload = {
  sections: FullYearSection[];
  rollups: Record<FullYearRollupKey, FullYearCell>;
};

const ROLLUP_KEYS: FullYearRollupKey[] = [
  "totalRevenues", "totalOperatingExpenses", "netOperatingIncome",
  "cashFlowBeforeDebtService", "totalDebtService", "cashFlowAfterDebtService",
];

/** Account-level sum of several entities' monthly GLs into one (fund = shell +
 *  member buildings). Mirrors statementStore's consolidation but on the raw
 *  full GLs (no interim posting deltas), matching the on-screen statement. */
export function combineGls(gls: StoredGl[]): StoredGl {
  const monthly: Record<string, number[]> = {};
  const beginning: Record<string, number> = {};
  const ytdTotal: Record<string, number> = {};
  const names: Record<string, string> = {};
  let maxPeriodInFile = 0, coverageEnd = 0;
  let coverageStartMonth: number | undefined;
  for (const g of gls) {
    for (const [a, nets] of Object.entries(g.monthly)) {
      const arr = (monthly[a] ??= new Array(12).fill(0));
      for (let i = 0; i < 12; i++) arr[i] += nets[i] ?? 0;
    }
    if (g.beginning) for (const [a, v] of Object.entries(g.beginning)) beginning[a] = (beginning[a] ?? 0) + v;
    if (g.ytdTotal) for (const [a, v] of Object.entries(g.ytdTotal)) ytdTotal[a] = (ytdTotal[a] ?? 0) + v;
    if (g.names) for (const [a, n] of Object.entries(g.names)) if (n && !names[a]) names[a] = n;
    maxPeriodInFile = Math.max(maxPeriodInFile, g.maxPeriodInFile || 0);
    coverageEnd = Math.max(coverageEnd, g.coverageEnd ?? g.maxPeriodInFile ?? 0);
    if (g.coverageStartMonth != null) coverageStartMonth = Math.min(coverageStartMonth ?? 12, g.coverageStartMonth);
  }
  return { ...gls[gls.length - 1], monthly, beginning, ytdTotal, names, maxPeriodInFile, coverageEnd, coverageStartMonth };
}

/** Build the 12-month + full-year-total payload from a resolved GL. Pure: the
 *  caller supplies the mapping, the property name, the stored monthly nets, and
 *  the (period-12) budget lookup. Each month's column is that month's
 *  periodActual; the Full-Year figures are the year's totals through December. */
export function buildFullYearPayload(
  mapping: ComputeInput["mapping"],
  propertyName: string,
  year: number,
  storedMonthly: Record<string, number[]>,
  fullBudgetLookup: ComputeInput["budgetLookup"],
): FullYearPayload {
  const perMonth = Array.from({ length: 12 }, (_, i) =>
    computeStatement({ mapping, propertyName, year, period: i + 1, gl: summaryForPeriod(storedMonthly, i + 1) }),
  );
  const full = computeStatement({
    mapping, propertyName, year, period: 12,
    gl: summaryForPeriod(storedMonthly, 12),
    budgetLookup: fullBudgetLookup,
  });
  return {
    sections: full.sections.map((s, si) => ({
      name: s.name,
      role: s.role,
      lines: s.lines.map((l, li) => ({
        label: l.label,
        mask: l.mask,
        accounts: l.accounts,
        monthly: perMonth.map((pm) => pm.sections[si].lines[li].periodActual),
        total: l.ytdActual,
        budget: l.ytdBudget,
        variance: l.ytdVariance,
      })),
      subtotalMonthly: perMonth.map((pm) => pm.sections[si].subtotal.periodActual),
      subtotalTotal: s.subtotal.ytdActual,
      subtotalBudget: s.subtotal.ytdBudget,
      subtotalVariance: s.subtotal.ytdVariance,
    })),
    rollups: Object.fromEntries(ROLLUP_KEYS.map((rk) => [rk, {
      monthly: perMonth.map((pm) => pm.rollups[rk].periodActual),
      total: full.rollups[rk].ytdActual,
      budget: full.rollups[rk].ytdBudget,
      variance: full.rollups[rk].ytdVariance,
    }])) as FullYearPayload["rollups"],
  };
}

export type FullYearRow =
  | { kind: "group"; label: string }
  | { kind: "line"; label: string; monthly: number[]; total: number }
  | { kind: "subtotal" | "rollup"; label: string; monthly: number[]; total: number; strong?: boolean };

const fyEmpty = (monthly: number[], total: number) =>
  Math.abs(total) < 0.5 && monthly.every((m) => Math.abs(m ?? 0) < 0.5);

/** The ordered rows for the full-year grid — same section ordering + empty-line
 *  skipping as the on-screen table and the single-period export. */
export function fullYearRows(p: FullYearPayload): FullYearRow[] {
  const rows: FullYearRow[] = [];
  const byRole = (roles: SectionRole[]) => p.sections.filter((s) => roles.includes(s.role));
  const pushSection = (sec: FullYearSection, withSubtotal = true) => {
    for (const l of sec.lines) if (!fyEmpty(l.monthly, l.total)) rows.push({ kind: "line", label: l.label, monthly: l.monthly, total: l.total });
    if (withSubtotal) rows.push({ kind: "subtotal", label: sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`, monthly: sec.subtotalMonthly, total: sec.subtotalTotal });
  };
  const hasActivity = (secs: FullYearSection[]) => secs.some((sec) => sec.lines.some((l) => !fyEmpty(l.monthly, l.total)) || !fyEmpty(sec.subtotalMonthly, sec.subtotalTotal));
  const R = p.rollups;

  rows.push({ kind: "group", label: "Revenues" });
  byRole(["revenue", "reimbursement"]).forEach((s) => pushSection(s));
  rows.push({ kind: "rollup", label: "Total Revenues", monthly: R.totalRevenues.monthly, total: R.totalRevenues.total });
  rows.push({ kind: "group", label: "Operating Expenses" });
  byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]).forEach((s) => pushSection(s));
  rows.push({ kind: "rollup", label: "Total Operating Expenses", monthly: R.totalOperatingExpenses.monthly, total: R.totalOperatingExpenses.total });
  rows.push({ kind: "rollup", label: "Net Operating Income", monthly: R.netOperatingIncome.monthly, total: R.netOperatingIncome.total, strong: true });

  const capital = byRole(["capital"]);
  const debt = byRole(["debt-service"]);
  if (capital.length && hasActivity(capital)) {
    rows.push({ kind: "group", label: "Capital" });
    capital.forEach((s) => pushSection(s, false));
  }
  if (debt.length && hasActivity(debt)) {
    rows.push({ kind: "rollup", label: "Cash Flow Before Debt Service", monthly: R.cashFlowBeforeDebtService.monthly, total: R.cashFlowBeforeDebtService.total, strong: true });
    rows.push({ kind: "group", label: "Debt Service" });
    debt.forEach((s) => pushSection(s));
    rows.push({ kind: "rollup", label: "Total Debt Service", monthly: R.totalDebtService.monthly, total: R.totalDebtService.total });
    rows.push({ kind: "rollup", label: "Cash Flow After Debt Service", monthly: R.cashFlowAfterDebtService.monthly, total: R.cashFlowAfterDebtService.total, strong: true });
  } else {
    rows.push({ kind: "rollup", label: "Cash Flow", monthly: R.cashFlowBeforeDebtService.monthly, total: R.cashFlowBeforeDebtService.total, strong: true });
  }
  return rows;
}

export type LoadedFullYear = {
  payload: FullYearPayload;
  meta: StatementMeta & { maxPeriodInFile: number; label: "Full Year" | "Year to Date" };
  notes: Record<string, string>;
};

/** Resolve a property/year's stored GL exactly as the page route's default view
 *  does (fund consolidation, no version pin), then build the full-year payload.
 *  Returns null when there's no mapping or no GL. */
export async function loadFullYearStatement(key: string, year: number): Promise<LoadedFullYear | null> {
  const mapping = await getMapping(key);
  if (!mapping) return null;

  const fulls = await listFullGls();
  const assembleFor = (k: string, yr: number) => assembleGls(fulls.filter((g) => g.key === k && g.year === yr));
  const fundParts = FUND_BUILDINGS[key];
  const stored = fundParts
    ? combineGls([key, ...fundParts].map((k) => assembleFor(k, year)).filter((g): g is StoredGl => !!g))
    : assembleFor(key, year);
  if (!stored) return null;

  const budgetCodes = fundParts ? [key, ...fundParts, mapping.propertyCode] : mapping.propertyCode;
  const budget = await resolvePropertyBudget(budgetCodes, year);
  const sameYearBudget = budget && !budget.fallback ? budget : null;
  const fullBudgetLookup = sameYearBudget ? makeBudgetLookup(sameYearBudget, 12) : undefined;

  const propertyName = PROPERTY_DEFS.find((p) => p.id === key)?.name ?? mapping.entityName;
  const payload = buildFullYearPayload(mapping, propertyName, year, stored.monthly, fullBudgetLookup);

  const { notes } = await getNotesBundle(key, year, 12);
  const maxPeriodInFile = stored.maxPeriodInFile || 12;
  return {
    payload,
    meta: {
      propertyCode: mapping.propertyCode, propertyName, year, period: maxPeriodInFile,
      budgetYear: sameYearBudget?.budgetYear ?? null,
      maxPeriodInFile,
      label: maxPeriodInFile >= 12 ? "Full Year" : "Year to Date",
    },
    notes,
  };
}
