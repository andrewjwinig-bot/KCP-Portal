// Reprojection compute — the pure engine.
//
//   mapping (lines + masks) + GL monthly nets + budget monthly + actuals-through
//   → a full-year, month-by-month forecast that blends actuals (for elapsed
//     months) with budget (for the remaining months).
//
// The third Financials view alongside Operating Budgets (the plan) and
// Operating Statements (what happened): for each line and each month, use the
// ACTUAL when that month is within the actuals we have, else the BUDGET. The
// row's reprojected full-year total is the sum of the blended months. Reuses
// the Operating Statements role/sign/favorability logic and the same line
// mapping, so the section ladder + rollups match the budget and statement.

import { accountsMatchingMask, accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { roleSign, favorability } from "@/lib/financials/operating-statements/compute";
import {
  EXPENSE_ROLES,
  type MappingSection,
  type SectionRole,
  type StatementMapping,
} from "@/lib/financials/operating-statements/types";

const MONTHS = 12;
const zero = (): number[] => new Array(MONTHS).fill(0);
const sumSeries = (parts: number[][]): number[] => {
  const out = zero();
  for (const p of parts) for (let i = 0; i < MONTHS; i++) out[i] += p[i] ?? 0;
  return out;
};
const diffSeries = (a: number[], b: number[]): number[] => a.map((v, i) => v - (b[i] ?? 0));
const total = (s: number[]): number => s.reduce((a, v) => a + v, 0);

/** A budget line flattened to its GL account + 12 monthly amounts (display
 *  orientation: revenue + expense both positive). */
export type ReprojBudgetLine = { glAccount: string; months: number[] };

export type ReprojLine = {
  label: string;
  mask: string;
  /** Per-month actual (sign-applied to display orientation), 12 entries. */
  actual: number[];
  /** Per-month budget, 12 entries. */
  budget: number[];
  /** Per-month blended forecast: actual for elapsed months, budget after. */
  blended: number[];
  reprojTotal: number;
  budgetTotal: number;
  /** Favorable-signed (reproj − budget). null when no budget. */
  variance: number | null;
};

export type ReprojTotals = {
  actual: number[];
  budget: number[];
  blended: number[];
  reprojTotal: number;
  budgetTotal: number;
  variance: number | null;
};

export type ReprojSection = {
  name: string;
  role: SectionRole;
  lines: ReprojLine[];
  subtotal: ReprojTotals;
};

export type Reprojection = {
  propertyCode: string;
  propertyName: string;
  year: number;
  /** Number of leading months that are actual (0–12). */
  actualThroughMonth: number;
  sections: ReprojSection[];
  rollups: {
    totalRevenues: ReprojTotals;
    totalOperatingExpenses: ReprojTotals;
    netOperatingIncome: ReprojTotals;
    capital: ReprojTotals;
    cashFlowBeforeDebtService: ReprojTotals;
    totalDebtService: ReprojTotals;
    cashFlowAfterDebtService: ReprojTotals;
  };
  /** GL accounts with actuals but no budget/mapping line — surfaced so the
   *  full-year number isn't silently short. */
  unbudgetedAccounts: { account: string; actualTotal: number }[];
};

export type ReprojectInput = {
  mapping: StatementMapping;
  propertyName: string;
  year: number;
  /** account → 12 monthly nets (Debit − Credit), from the uploaded GL. */
  glMonthly: Record<string, number[]>;
  /** Flattened budget lines (one per GL account, 12 months display-positive). */
  budgetLines: ReprojBudgetLine[];
  /** Months 1..actualThroughMonth use actuals; the rest use budget. */
  actualThroughMonth: number;
};

function totalsFor(actual: number[], budget: number[], blended: number[], fav: 1 | -1): ReprojTotals {
  const reprojTotal = total(blended);
  const budgetTotal = total(budget);
  return { actual, budget, blended, reprojTotal, budgetTotal, variance: fav * (reprojTotal - budgetTotal) };
}

function blend(actual: number[], budget: number[], through: number): number[] {
  return actual.map((a, i) => (i < through ? a : (budget[i] ?? 0)));
}

export function reproject(input: ReprojectInput): Reprojection {
  const through = Math.min(MONTHS, Math.max(0, input.actualThroughMonth));
  const accounts = Object.keys(input.glMonthly);
  const usedAccounts = new Set<string>();

  const sections: ReprojSection[] = input.mapping.sections.map((section: MappingSection) => {
    const sign = roleSign(section.role);
    const fav = favorability(section.role);
    const lines: ReprojLine[] = section.lines.map((l) => {
      const matched = accountsMatchingMask(l.mask, accounts);
      const set = new Set(matched);
      matched.forEach((a) => usedAccounts.add(a));
      // Actuals: sum matching GL accounts' monthly nets, sign to display.
      const actual = zero();
      for (const acct of accounts) {
        if (!set.has(acct)) continue;
        const m = input.glMonthly[acct] ?? [];
        for (let i = 0; i < MONTHS; i++) actual[i] += (m[i] ?? 0) * sign;
      }
      // Budget: sum matching budget lines' monthly amounts.
      const budget = zero();
      for (const bl of input.budgetLines) {
        if (!accountMatchesMask(l.mask, bl.glAccount)) continue;
        for (let i = 0; i < MONTHS; i++) budget[i] += bl.months[i] ?? 0;
      }
      const blended = blend(actual, budget, through);
      return { label: l.label, mask: l.mask, ...totalsFor(actual, budget, blended, fav) };
    });
    // Section subtotal = sum of its lines (per series), variance under its fav.
    const actual = sumSeries(lines.map((l) => l.actual));
    const budget = sumSeries(lines.map((l) => l.budget));
    const blended = sumSeries(lines.map((l) => l.blended));
    return { name: section.name, role: section.role, lines, subtotal: totalsFor(actual, budget, blended, fav) };
  });

  const subSeries = (roles: SectionRole[], pick: (s: ReprojSection) => number[]) =>
    sumSeries(sections.filter((s) => roles.includes(s.role)).map(pick));
  const rollup = (roles: SectionRole[], fav: 1 | -1): ReprojTotals =>
    totalsFor(
      subSeries(roles, (s) => s.subtotal.actual),
      subSeries(roles, (s) => s.subtotal.budget),
      subSeries(roles, (s) => s.subtotal.blended),
      fav
    );
  const diffRollup = (a: ReprojTotals, b: ReprojTotals, fav: 1 | -1): ReprojTotals =>
    totalsFor(diffSeries(a.actual, b.actual), diffSeries(a.budget, b.budget), diffSeries(a.blended, b.blended), fav);

  const totalRevenues = rollup(["revenue", "reimbursement"], 1);
  const totalOperatingExpenses = rollup(EXPENSE_ROLES, -1);
  const netOperatingIncome = diffRollup(totalRevenues, totalOperatingExpenses, 1);
  const capital = rollup(["capital"], -1);
  const cashFlowBeforeDebtService = diffRollup(netOperatingIncome, capital, 1);
  const totalDebtService = rollup(["debt-service"], -1);
  const cashFlowAfterDebtService = diffRollup(cashFlowBeforeDebtService, totalDebtService, 1);

  // Unbudgeted actuals — GL accounts with activity not captured by any line.
  const unbudgetedAccounts = accounts
    .filter((a) => !usedAccounts.has(a))
    .map((a) => ({ account: a, actualTotal: total(input.glMonthly[a] ?? []) }))
    .filter((u) => Math.abs(u.actualTotal) > 0.005)
    .sort((x, y) => Math.abs(y.actualTotal) - Math.abs(x.actualTotal));

  return {
    propertyCode: input.mapping.propertyCode,
    propertyName: input.propertyName,
    year: input.year,
    actualThroughMonth: through,
    sections,
    rollups: {
      totalRevenues,
      totalOperatingExpenses,
      netOperatingIncome,
      capital,
      cashFlowBeforeDebtService,
      totalDebtService,
      cashFlowAfterDebtService,
    },
    unbudgetedAccounts,
  };
}
