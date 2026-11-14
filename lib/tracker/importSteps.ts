// HOW TO GET EACH FILE THE PORTAL ASKS FOR (owner, 11/2026: "next to import
// prompts should be a little info icon that has the steps … to help guide
// someone to access the report or file").
//
// ONE place, keyed by the import reminder's id (`IMPORT_REMINDERS` in
// imports.ts) plus the close checklist's own items — every import prompt (the
// work queue, Data Imports, the Month-End Close) shows the same steps through
// `ImportStepsButton`. Change a step here and it changes everywhere. The
// Skyline paths are the ones the import pages' own instruction modals give.

export type ImportSteps = {
  /** What the file is, as the person would ask for it. */
  title: string;
  /** Where it comes from, as a menu path. */
  where: string[];
  steps: string[];
  /** Where it goes in the portal. */
  importAt: { label: string; href: string };
  /** A folder the file is saved to or found in — drawn by `FilePath`, never
   *  typed into a step. `{year}` is filled with this year. */
  path?: { label: string; value: string };
  /** One line worth knowing before you start. */
  note?: string;
};

const XLS = "Export, then Microsoft Excel (97-2003) (.xls), the third option from the top, and save.";

export const IMPORT_STEPS: Record<string, ImportSteps> = {
  "imp-gl": {
    title: "Detailed General Ledger",
    where: ["Skyline", "General Ledger", "Reports", "Detailed General Ledger"],
    steps: [
      "Set Beginning Date and End Date to the month being imported (the first to the last day).",
      "Run it for PALL (every property in one file) — or for one property.",
      XLS,
      "Save it to the Monthly GLs folder below. The file name does not matter.",
      "In the portal: Operating Statements, Upload GL, and pick the files.",
    ],
    path: { label: "Save to", value: "Data\\Accounting\\{year} Year End\\Reports to Eisner\\Monthly GLs" },
    importAt: { label: "Operating Statements", href: "/financials/operating-statements" },
    note: "Importing 2000's GL sends the Allocated Expenses to AvidXchange on its own.",
  },
  "imp-rentroll": {
    title: "Rent Roll",
    where: ["Skyline", "Property Management", "Reports", "Rent Roll Reports", "Commercial Rent Roll"],
    steps: [
      "Set Beginning Date and End Date to the month being imported.",
      XLS,
      "In the portal: Rent Roll, Import, and pick the file. An office-only or retail-only file merges into the month; nothing else is lost.",
    ],
    importAt: { label: "Rent Roll", href: "/rentroll" },
  },
  "imp-stmts": {
    title: "Laser Statement (tenant open charges)",
    where: ["Skyline", "Laser Statement"],
    // Where Tanya files them each month (PDFs today).
    path: { label: "Find them in", value: "Data\\Shared\\Properties\\Billings and Statements\\{year} Billing and Statements\\<NN Month>\\Laser Statements" },
    steps: [
      "Tanya saves the month's Laser Statements as PDFs in the folder below — or run the Laser Statement in Skyline to Excel.",
      "In the portal: Monthly Statements, Import, and select every PDF in the folder at once. They merge into one month; a one-tenant re-run updates only that tenant.",
    ],
    importAt: { label: "Receivables", href: "/tenant-statements" },
    note: "Upload the files as saved — every tenant is checked against the Total Amount Due Skyline printed.",
  },
  "imp-aging": {
    title: "Credit Balance Report",
    where: ["Skyline", "Property Management", "Reports", "Financial Reports", "Credit Balance"],
    steps: [
      "Occupants to Include: Any With Open Credits. Preview.",
      "Export as Microsoft Excel (97-2003) (.xls).",
      "In the portal: Open Credits (or Receivables), Import Credit Balance Report, and pick the file.",
    ],
    importAt: { label: "Open Credits", href: "/tenant-statements/credits" },
    note: "Anyone can import it. On or after the 15th the import builds the month's tenant notices and emails Greg to approve them.",
  },
  "imp-bank": {
    title: "Bank Balances",
    where: ["Chase, Liberty and M&T online banking", "Accounts page"],
    steps: [
      "Chase: the Accounts page. Liberty: Account Summary. M&T Treasury Center: Previous Day Deposit Accounts.",
      "In Chrome: Print, then Save as PDF (not the Adobe PDF printer — it can't be read).",
      "In the portal: Bank Balances, Import, and drop all three PDFs.",
    ],
    importAt: { label: "Bank Balances", href: "/financials/cash-analysis" },
    note: "Once every bank is in for the week, the cash position emails ownership on its own.",
  },
  "imp-cc": {
    title: "Credit Card Statement (AmEx)",
    where: ["American Express online", "Statements & Activity"],
    steps: [
      "Download the closed statement's activity as an Excel file.",
      "In the portal: Credit Card Expense Coder, Import, and pick the file.",
    ],
    importAt: { label: "Credit Card Expenses", href: "/expenses" },
  },
  "imp-payroll": {
    title: "Payroll Register",
    where: ["Payroll provider", "Reports", "Payroll Register"],
    steps: [
      "Export the Payroll Register for the pay date as Excel (.xls or .xlsx).",
      "In the portal: Payroll Invoicer, Import, then Save Pay Period.",
    ],
    importAt: { label: "Payroll Invoicer", href: "/" },
  },
  bankrec: {
    title: "Bank Reconciliation files",
    where: ["SharePoint", "Accounting", "Bank Account Reconciliations"],
    path: { label: "Find them in", value: "Data\\Accounting\\!{year} Year End\\Bank Account Reconciliations\\<NN Month YYYY>\\<Bank>" },
    steps: [
      "The month's bank statements (Chase, M&T, Liberty PDFs) — Marie files them by bank.",
      "Skyline's Checking Account Report (.xls) for the month.",
      "Marie's Skyline Statement Reconcile Reports, where filed.",
      "In the portal: Bank Recs, drop the month's folder. Files are matched by the account number inside them; names don't matter.",
    ],
    importAt: { label: "Bank Recs", href: "/bank-rec/reconcile" },
  },
};

/** The close checklist's item ids → the import they are. */
export const CLOSE_ITEM_STEPS: Record<string, string> = {
  gl: "imp-gl", rentroll: "imp-rentroll", laser: "imp-stmts", bankrec: "bankrec",
};

export function importStepsFor(id: string): ImportSteps | null {
  return IMPORT_STEPS[id] ?? IMPORT_STEPS[CLOSE_ITEM_STEPS[id] ?? ""] ?? null;
}
