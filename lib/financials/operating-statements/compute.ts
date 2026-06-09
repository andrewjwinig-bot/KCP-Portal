// Operating-statement compute — the pure engine.
//
//   mapping (lines + masks) + GL/TB summary + budget lookup → PropertyStatement
//
// Mirrors the CAM recon engine: a dependency-free function so it's trivially
// testable (compute.test.ts) and reused by the API + any export. The page,
// importer, and budget wiring all layer on top.

import { accountsMatchingMask } from "./mask";
import {
  EXPENSE_ROLES,
  type GlSummaryRow,
  type LineBudget,
  type MappingSection,
  type PropertyStatement,
  type SectionRole,
  type StatementLine,
  type StatementMapping,
  type StatementRollups,
  type StatementSection,
  type StatementTotals,
} from "./types";

/** Skyline stores revenue as credits (negative). The statement shows revenue
 *  as positive, so revenue/reimbursement raw sums are negated; expenses (debits)
 *  pass through. Flip this if a given GL export already presents revenue
 *  positive. */
const REVENUE_STORED_AS_CREDIT = true;

/** Sign applied to raw GL sums so the statement reads positive revenue +
 *  positive expense. */
function roleSign(role: SectionRole): 1 | -1 {
  if (!REVENUE_STORED_AS_CREDIT) return 1;
  return role === "revenue" || role === "reimbursement" ? -1 : 1;
}

/** Favorability sign for variance: revenue-like lines are favorable when
 *  actual exceeds budget (+1); expense-like lines are favorable when actual is
 *  under budget (−1). Variance = fav × (actual − budget). */
function favorability(role: SectionRole): 1 | -1 {
  return role === "revenue" || role === "reimbursement" ? 1 : -1;
}

const isExpenseRole = (r: SectionRole) => EXPENSE_ROLES.includes(r);

/** Build a totals row, deriving period/YTD variance from the favorability sign.
 *  A null budget (no portal budget loaded) yields null variance — blank, never
 *  blocking. */
function mkTotals(
  periodActual: number,
  periodBudget: number | null,
  ytdActual: number,
  ytdBudget: number | null,
  annualBudget: number | null,
  fav: 1 | -1
): StatementTotals {
  return {
    periodActual,
    periodBudget,
    periodVariance: periodBudget == null ? null : fav * (periodActual - periodBudget),
    ytdActual,
    ytdBudget,
    ytdVariance: ytdBudget == null ? null : fav * (ytdActual - ytdBudget),
    annualBudget,
  };
}

/** Sum a list of totals into one (used for section subtotals and rollups).
 *  Budgets sum as numbers when present; if none of the parts carry a budget
 *  the result budget is null. Variance is recomputed from the summed figures
 *  under the supplied favorability so a subtotal's variance always ties to its
 *  own actual/budget. */
function sumTotals(parts: StatementTotals[], fav: 1 | -1): StatementTotals {
  const anyP = parts.some((p) => p.periodBudget != null);
  const anyY = parts.some((p) => p.ytdBudget != null);
  const anyA = parts.some((p) => p.annualBudget != null);
  const pa = parts.reduce((a, p) => a + p.periodActual, 0);
  const ya = parts.reduce((a, p) => a + p.ytdActual, 0);
  const pb = anyP ? parts.reduce((a, p) => a + (p.periodBudget ?? 0), 0) : null;
  const yb = anyY ? parts.reduce((a, p) => a + (p.ytdBudget ?? 0), 0) : null;
  const ab = anyA ? parts.reduce((a, p) => a + (p.annualBudget ?? 0), 0) : null;
  return mkTotals(pa, pb, ya, yb, ab, fav);
}

/** Combine two totals as `a − b` (NOI = Revenues − OpEx, etc.), recomputing
 *  variance under `fav`. */
function diffTotals(a: StatementTotals, b: StatementTotals, fav: 1 | -1): StatementTotals {
  const sub = (x: number | null, y: number | null) =>
    x == null && y == null ? null : (x ?? 0) - (y ?? 0);
  return mkTotals(
    a.periodActual - b.periodActual,
    sub(a.periodBudget, b.periodBudget),
    a.ytdActual - b.ytdActual,
    sub(a.ytdBudget, b.ytdBudget),
    sub(a.annualBudget, b.annualBudget),
    fav
  );
}

export type ComputeInput = {
  mapping: StatementMapping;
  propertyName: string;
  year: number;
  period: number;
  gl: GlSummaryRow[];
  /** Budget figures for a line, by (section name, line label, account mask).
   *  The mask lets a crosswalk match the line to budget GL accounts. Return
   *  null for no-budget — the column renders blank. */
  budgetLookup?: (sectionName: string, lineLabel: string, mask: string) => LineBudget | null;
};

function computeLine(
  line: { label: string; mask: string },
  role: SectionRole,
  gl: GlSummaryRow[],
  accounts: string[],
  budgetLookup?: ComputeInput["budgetLookup"],
  sectionName?: string
): StatementLine {
  const sign = roleSign(role);
  const matched = accountsMatchingMask(line.mask, accounts);
  const set = new Set(matched);
  let periodActual = 0;
  let ytdActual = 0;
  for (const row of gl) {
    if (!set.has(row.account)) continue;
    periodActual += row.periodActual;
    ytdActual += row.ytdActual;
  }
  periodActual *= sign;
  ytdActual *= sign;
  const b = budgetLookup?.(sectionName ?? "", line.label, line.mask) ?? null;
  const t = mkTotals(
    periodActual,
    b?.periodBudget ?? null,
    ytdActual,
    b?.ytdBudget ?? null,
    b?.annualBudget ?? null,
    favorability(role)
  );
  return { label: line.label, mask: line.mask, accounts: matched, ...t };
}

function computeSection(
  section: MappingSection,
  gl: GlSummaryRow[],
  accounts: string[],
  budgetLookup?: ComputeInput["budgetLookup"]
): StatementSection {
  const lines = section.lines.map((l) =>
    computeLine(l, section.role, gl, accounts, budgetLookup, section.name)
  );
  return {
    name: section.name,
    role: section.role,
    lines,
    subtotal: sumTotals(lines, favorability(section.role)),
  };
}

export function computeStatement(input: ComputeInput): PropertyStatement {
  const { mapping, gl, budgetLookup } = input;
  const accounts = gl.map((r) => r.account);
  const sections = mapping.sections.map((s) =>
    computeSection(s, gl, accounts, budgetLookup)
  );

  const subOf = (roles: SectionRole[]) =>
    sections.filter((s) => roles.includes(s.role)).map((s) => s.subtotal);

  const totalRevenues = sumTotals(subOf(["revenue", "reimbursement"]), 1);
  const totalOperatingExpenses = sumTotals(subOf(EXPENSE_ROLES), -1);
  const netOperatingIncome = diffTotals(totalRevenues, totalOperatingExpenses, 1);
  const capital = sumTotals(subOf(["capital"]), -1);
  const cashFlowBeforeDebtService = diffTotals(netOperatingIncome, capital, 1);
  const totalDebtService = sumTotals(subOf(["debt-service"]), -1);
  const cashFlowAfterDebtService = diffTotals(
    cashFlowBeforeDebtService,
    totalDebtService,
    1
  );

  const rollups: StatementRollups = {
    totalRevenues,
    totalOperatingExpenses,
    netOperatingIncome,
    cashFlowBeforeDebtService,
    totalDebtService,
    cashFlowAfterDebtService,
  };

  // Trial-balance tie-out: any GL account not captured by some line's mask.
  const mapped = new Set<string>();
  for (const s of sections) for (const l of s.lines) for (const a of l.accounts) mapped.add(a);
  const unmappedAccounts = gl
    .filter((r) => !mapped.has(r.account) && Math.abs(r.ytdActual) > 0.005)
    .map((r) => ({ account: r.account, ytdActual: r.ytdActual }));

  return {
    propertyCode: mapping.propertyCode,
    propertyName: input.propertyName,
    entityName: mapping.entityName,
    year: input.year,
    period: input.period,
    sections,
    rollups,
    unmappedAccounts,
  };
}

export { isExpenseRole, roleSign, favorability, REVENUE_STORED_AS_CREDIT };
