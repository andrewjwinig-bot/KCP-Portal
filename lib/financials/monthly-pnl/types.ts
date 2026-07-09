// Monthly P&L (income statement) history, imported from the "Actual by Month" /
// "Budget by Month" reporting workbooks (one sheet per building, a Revenues →
// Operating Expenses → NOI → Debt Service waterfall with 12 monthly columns).
//
// Pure types — no server/XLSX imports — so the parser, store, API and tests can
// all share them.

export type PnlKind = "actual" | "budget";

/** One P&L line: a GL-account-mask line within a section, with 12 monthly values. */
export type PnlLine = {
  /** Section the line belongs to (revenues, reimbursements, reimbursable expenses, …). */
  section: string;
  label: string;
  /** GL account mask exactly as written in the workbook (e.g. "6250-8501,6250-8502"). */
  mask: string;
  /** Jan–Dec, always length 12. */
  monthly: number[];
  total: number;
  /** The workbook's "Annual … Budget" column for this line (0 if none). */
  annualBudget: number;
};

/** A named subtotal row (Total Revenues, Total Operating Expenses, NOI, …). */
export type PnlSubtotal = { monthly: number[]; total: number; annualBudget: number };

/** Canonical subtotal keys we pull out of the waterfall for reporting. */
export type PnlSubtotals = Partial<Record<
  | "totalRevenueAndOther"
  | "totalReimbursements"
  | "totalRevenues"
  | "totalReimbursableExpenses"
  | "totalNonReimbursableExpenses"
  | "totalOperatingExpenses"
  | "netOperatingIncome"
  | "totalDebtService"
  | "cashFlowBeforeDebtService"
  | "cashFlowAfterDebtService",
  PnlSubtotal
>>;

/** One building's income statement for one year, actual or budget. */
export type MonthlyPnlStatement = {
  /** Building/property code, e.g. "3640", "40A0". */
  propertyCode: string;
  propertyName: string;
  year: number;
  kind: PnlKind;
  /** Fund/ownership grouping this building rolls up to (e.g. "JV III", "NI LLC"). */
  fund?: string;
  lines: PnlLine[];
  subtotals: PnlSubtotals;
  uploadedAt?: string;
  uploadedBy?: string | null;
  sourceFile?: string;
};

/** Stable storage id for a statement. */
export function pnlStatementId(propertyCode: string, year: number, kind: PnlKind): string {
  return `${propertyCode}-${year}-${kind}`;
}
