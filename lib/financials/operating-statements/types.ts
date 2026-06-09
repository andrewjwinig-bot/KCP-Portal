// Operating-statement model — the actuals twin of the operating budget.
//
// A statement is a Comparative Income Statement for one property + period:
// the same section ladder as the budget (Revenues → Reimbursements → Total
// Revenues → expenses → NOI → capital → Cash Flow), but with Actual / Budget /
// Variance columns for the current period and YTD.
//
// Source of truth split (mirrors the CAM config pattern):
//   • LINE STRUCTURE + ACCOUNT MASKS live in the per-property mapping seed
//     (data/operating-statements/line-mappings.json). Masks are per-property
//     customizations, not one-per-type — captured from the Skyline workbook.
//   • ACTUALS come from the uploaded GL/Trial-Balance (mapped via the masks).
//   • BUDGET columns read the portal's Operating Budgets — one source, so the
//     statement ties to the Budgets page automatically.

/** Role drives the rollup math (Total Revenues / NOI / Cash Flow) generically,
 *  so SC (reimbursable + non-reimbursable), Office, and Residential (single
 *  expense block) all compute the same way. */
export type SectionRole =
  | "revenue"
  | "reimbursement"
  | "reimbursable-expense"
  | "non-reimbursable-expense"
  | "residential-expense"
  | "capital"
  | "debt-service";

/** Expense roles roll into Total Operating Expenses; capital + debt sit below
 *  NOI. Revenue + reimbursement roll into Total Revenues. */
export const EXPENSE_ROLES: SectionRole[] = [
  "reimbursable-expense",
  "non-reimbursable-expense",
  "residential-expense",
];

/** One mapped statement line in the seed — a label + the GL account mask that
 *  aggregates into it. Masks support exact (`6030-8502`), comma-lists,
 *  wildcards (`4230-*`, `6*-8503`, `7*-*`), and numeric ranges (`4980..4999-*`).
 *  See mask.ts for the grammar. */
export type MappingLine = {
  label: string;
  /** Raw mask string straight from column A of the workbook. */
  mask: string;
};

export type MappingSection = {
  name: string;
  role: SectionRole;
  lines: MappingLine[];
};

/** Per-property line mapping — the canonical structure + masks for one
 *  property's statement. Keyed by propertyCode in the seed. */
export type StatementMapping = {
  propertyCode: string;
  entityName: string;
  sections: MappingSection[];
};

/** A single GL/TB summary row fed to the compute — one account with its
 *  current-period and YTD actuals. Derived at import from the detailed GL
 *  (sum of transactions in the period / YTD) or read straight from a TB. */
export type GlSummaryRow = {
  /** Full account, e.g. "4230-8501". */
  account: string;
  /** Current-period (single-month) actual. Revenues are stored as written
   *  in Skyline (credits negative); the compute normalizes sign per role. */
  periodActual: number;
  /** Year-to-date actual through the period. */
  ytdActual: number;
};

/** Budget figures for one statement line, looked up from the portal budget.
 *  Any missing piece renders blank — a statement never blocks on a budget. */
export type LineBudget = {
  periodBudget: number | null;
  ytdBudget: number | null;
  annualBudget: number | null;
};

/** A computed statement line — actuals mapped in, budget lined up, variances
 *  derived. `accounts` records which GL accounts matched (drill-down + audit). */
export type StatementLine = {
  label: string;
  mask: string;
  periodActual: number;
  periodBudget: number | null;
  periodVariance: number | null;
  ytdActual: number;
  ytdBudget: number | null;
  ytdVariance: number | null;
  annualBudget: number | null;
  /** GL accounts that matched this line's mask (for the click-through). */
  accounts: string[];
};

/** A section with its lines + a subtotal row (e.g. "Total Reimbursements"). */
export type StatementSection = {
  name: string;
  role: SectionRole;
  lines: StatementLine[];
  subtotal: StatementTotals;
};

/** The Actual/Budget/Variance figure-set shared by lines, subtotals, and
 *  rollups. */
export type StatementTotals = {
  periodActual: number;
  periodBudget: number | null;
  periodVariance: number | null;
  ytdActual: number;
  ytdBudget: number | null;
  ytdVariance: number | null;
  annualBudget: number | null;
};

/** Cross-section rollups — the bold lines that tie the statement together. */
export type StatementRollups = {
  totalRevenues: StatementTotals;
  totalOperatingExpenses: StatementTotals;
  netOperatingIncome: StatementTotals;
  cashFlowBeforeDebtService: StatementTotals;
  totalDebtService: StatementTotals;
  cashFlowAfterDebtService: StatementTotals;
};

export type PropertyStatement = {
  propertyCode: string;
  propertyName: string;
  entityName: string;
  year: number;
  /** Reporting period 1–12 (the "Current Period" / month). */
  period: number;
  sections: StatementSection[];
  rollups: StatementRollups;
  /** Trial-balance tie-out: accounts present in the GL/TB but NOT mapped into
   *  any statement line (Depreciation, Interest, Deferred costs, Rounding…).
   *  A non-zero leftover is surfaced as a tie-out warning. */
  unmappedAccounts: { account: string; ytdActual: number; name?: string | null }[];
};
