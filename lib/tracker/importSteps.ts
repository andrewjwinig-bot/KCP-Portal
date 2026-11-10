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
      "Run it for the property (or every property you are importing).",
      XLS,
      "Save to Data\\Accounting\\<year> Year End\\Reports to Eisner\\Monthly GLs. The file name does not matter.",
      "In the portal: Operating Statements, Upload GL, and pick the files.",
    ],
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
    steps: [
      "Run the Laser Statement for the month, across the buildings being billed — on the 1st or 2nd, before payments come in.",
      "Report Destination: Excel. Save the .xls it produces.",
      "In the portal: Monthly Statements, Import, and upload it unmodified. Several files (shopping centres and business parks separately) merge into one month.",
    ],
    importAt: { label: "Monthly Statements", href: "/tenant-statements" },
    note: "Don't delete rows or re-sort — every tenant is checked against the balance Skyline printed.",
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
    where: ["SharePoint", "Accounting", "<year> Year End", "Bank Account Reconciliations", "<NN Month YYYY>"],
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
