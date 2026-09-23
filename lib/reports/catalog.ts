// The report center's catalog — every report the portal produces, described
// ONCE. The Reports page (`app/reports/page.tsx`) renders this list; a new
// report, or a custom one built only for the center, is one entry here.
//
// Each entry points at the page that produces it (`href`), and the center shows
// an entry only to someone who can open that page — so the catalog never
// advertises a report a person cannot run.

export type ReportFormat = "Excel" | "PDF" | "CSV" | "ZIP" | "On screen";

export type ReportCategory =
  | "Financial"
  | "Tenants & leasing"
  | "CAM & recoveries"
  | "Banking & debt"
  | "Payroll & invoicing"
  | "Investors"
  | "Custom";

export type ReportEntry = {
  id: string;
  name: string;
  /** What it answers, in one line. */
  description: string;
  category: ReportCategory;
  formats: ReportFormat[];
  /** The page that produces it. */
  href: string;
};

/** Categories in the order the center lists them. */
export const REPORT_CATEGORIES: ReportCategory[] = [
  "Financial",
  "Tenants & leasing",
  "CAM & recoveries",
  "Banking & debt",
  "Payroll & invoicing",
  "Investors",
  "Custom",
];

export const REPORTS: ReportEntry[] = [
  // ── Financial ──────────────────────────────────────────────────────────
  { id: "operating-statement", category: "Financial", name: "Operating Statement",
    description: "A property's month or full year against budget, line by line.",
    formats: ["Excel", "PDF"], href: "/financials/operating-statements" },
  { id: "flags-checklist", category: "Financial", name: "Flags to Investigate checklist",
    description: "Every open item year to date — missing postings, billing gaps, variances — with notes.",
    formats: ["Excel", "PDF"], href: "/financials/operating-statements/review" },
  { id: "reprojection", category: "Financial", name: "Reprojection",
    description: "This year's forecast: actuals to date, budget for the rest.",
    formats: ["Excel", "PDF"], href: "/financials/reprojections" },
  { id: "budget", category: "Financial", name: "Operating Budget",
    description: "The approved budget workbooks, with the Skyline import.",
    formats: ["Excel", "PDF"], href: "/financials/budgets" },
  { id: "cash-analysis", category: "Financial", name: "Cash Analysis",
    description: "Cash position and cash flow by property and fund.",
    formats: ["Excel", "PDF"], href: "/financials/cash-analysis" },
  { id: "balance-sheet", category: "Financial", name: "Balance Sheet",
    description: "Books-basis balance sheet as of any month — what a lender's certification asks for.",
    formats: ["Excel", "PDF"], href: "/financials/balance-sheet" },
  { id: "management-fees", category: "Financial", name: "Management Fees",
    description: "Fees billed by each building against LIK's intercompany revenue, month by month.",
    formats: ["Excel"], href: "/financials/management-fees" },
  { id: "ten99", category: "Financial", name: "1099 Register",
    description: "Vendor payments by filing entity, with every payment behind each total.",
    formats: ["Excel"], href: "/financials/ten99" },
  { id: "monthly-review", category: "Financial", name: "Monthly Review",
    description: "The portfolio's month in review, laid out for print.",
    formats: ["PDF"], href: "/reports/monthly" },

  // ── Tenants & leasing ──────────────────────────────────────────────────
  { id: "rent-roll", category: "Tenants & leasing", name: "Rent Roll",
    description: "Every suite, tenant, term and charge — by property or the whole portfolio.",
    formats: ["Excel", "PDF"], href: "/rentroll" },
  { id: "occupancy-trends", category: "Tenants & leasing", name: "Occupancy Trends",
    description: "Occupancy and rent over time, property by property.",
    formats: ["Excel"], href: "/rentroll/trends" },
  { id: "leasing-activity", category: "Tenants & leasing", name: "Leasing Activity",
    description: "New leases, renewals and move-outs — the status report.",
    formats: ["PDF"], href: "/rentroll/leasing" },
  { id: "tenant-statements", category: "Tenants & leasing", name: "Tenant Statements (open A/R)",
    description: "Each tenant's open charges, aged, as sent to the tenant portal.",
    formats: ["PDF"], href: "/tenant-statements" },
  { id: "security-deposits", category: "Tenants & leasing", name: "Security Deposits",
    description: "Deposits held, by tenant and property.",
    formats: ["On screen"], href: "/deposits" },

  // ── CAM & recoveries ───────────────────────────────────────────────────
  { id: "cam-recon", category: "CAM & recoveries", name: "CAM / RET Reconciliation",
    description: "Year-end tenant statements and the SC / BP year-end adjustments.",
    formats: ["PDF", "Excel"], href: "/cam-recon" },
  { id: "cam-estimates", category: "CAM & recoveries", name: "CAM / RET Estimates",
    description: "Next year's monthly estimates per tenant, ready to import.",
    formats: ["CSV"], href: "/cam-recon/estimates" },
  { id: "expense-history", category: "CAM & recoveries", name: "Operating Expense History",
    description: "Each property's expenses year by year, with office base years.",
    formats: ["On screen"], href: "/rentroll/base-years" },
  { id: "expense-trends", category: "CAM & recoveries", name: "Expense Trends",
    description: "How each expense line has moved across the years.",
    formats: ["On screen"], href: "/rentroll/base-years/trends" },

  // ── Banking & debt ─────────────────────────────────────────────────────
  { id: "debt", category: "Banking & debt", name: "Debt Schedule",
    description: "Every loan's balance, rate and payment schedule.",
    formats: ["On screen"], href: "/debt" },
  { id: "bank-recs", category: "Banking & debt", name: "Bank Reconciliations",
    description: "Book against bank, account by account, month by month.",
    formats: ["On screen"], href: "/bank-rec/reconcile" },
  { id: "bank-transfers", category: "Banking & debt", name: "Bank Transfers",
    description: "Transfer requests and their confirmations.",
    formats: ["PDF"], href: "/bank-transfers" },

  // ── Payroll & invoicing ────────────────────────────────────────────────
  { id: "payroll-history", category: "Payroll & invoicing", name: "Payroll History",
    description: "Past payroll allocations and the invoices they produced.",
    formats: ["On screen"], href: "/history" },
  { id: "cc-expenses", category: "Payroll & invoicing", name: "Credit Card Expense History",
    description: "Coded card statements, month by month.",
    formats: ["Excel"], href: "/expenses/history" },
  { id: "allocated", category: "Payroll & invoicing", name: "Allocated Expense Invoices",
    description: "The allocation summary and every building's invoice.",
    formats: ["Excel", "ZIP"], href: "/allocated-invoicer" },
  { id: "commissions", category: "Payroll & invoicing", name: "Leasing Commissions",
    description: "Commission memos, invoices and the journal entries.",
    formats: ["PDF", "Excel", "ZIP"], href: "/commissions" },

  // ── Investors ──────────────────────────────────────────────────────────
  { id: "statement-of-values", category: "Investors", name: "Statement of Values",
    description: "Each owner's interest and its value, with owner statements.",
    formats: ["Excel", "PDF", "ZIP"], href: "/investors" },
];

/** Case-insensitive match on name, description and category. */
export function matchesReport(r: ReportEntry, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return `${r.name} ${r.description} ${r.category} ${r.formats.join(" ")}`.toLowerCase().includes(t);
}
