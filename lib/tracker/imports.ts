// Recurring data imports — the files that have to be refreshed for the portal
// to stay current, surfaced in the weekly digest so nothing goes stale.
//
// This is the source of truth for "what do I need to import." Add/adjust
// entries here; the weekly email and (later) the dashboard read from it.

export type ImportCadence = "monthly" | "weekly" | "quarterly" | "as-needed";

export type ImportReminder = {
  id: string;
  /** The file / report to import. */
  label: string;
  cadence: ImportCadence;
  /** When it's due, in plain words (e.g. "By the 1st"). */
  when: string;
  /** Where it's imported. */
  link: string;
  /** What it feeds / why it matters. */
  feeds: string;
};

export const IMPORT_REMINDERS: ImportReminder[] = [
  { id: "imp-rentroll", label: "Rent Roll", cadence: "monthly", when: "By the 1st",
    link: "/rentroll", feeds: "Rent Roll, CAM recon, deposits, commissions" },
  { id: "imp-gl", label: "General Ledger (Skyline)", cadence: "monthly", when: "At monthly close",
    link: "/financials/operating-statements", feeds: "Operating Statements & Cash Analysis" },
  { id: "imp-ap", label: "AP Selection Report", cadence: "weekly", when: "Each pay week",
    link: "/financials/cash-analysis", feeds: "Est. Available Cash (Avid bills)" },
  { id: "imp-alloc-gl", label: "2000 G&A GL", cadence: "monthly", when: "At monthly close",
    link: "/allocated-invoicer", feeds: "Allocated Expense invoices" },
  { id: "imp-cc", label: "Credit-card statement", cadence: "monthly", when: "At monthly close",
    link: "/expenses", feeds: "Credit Card Expense Coder" },
];

/** Import reminders whose cadence makes them relevant in a given week —
 *  weeklies always, monthlies when the week contains the 1st. */
export function importsForWeek(weekStart: Date, weekEnd: Date): ImportReminder[] {
  const spansFirst = (() => {
    const d = new Date(weekStart);
    while (d <= weekEnd) { if (d.getDate() === 1) return true; d.setDate(d.getDate() + 1); }
    return false;
  })();
  return IMPORT_REMINDERS.filter((r) =>
    r.cadence === "weekly" || (r.cadence === "monthly" && spansFirst) || r.cadence === "quarterly" && spansFirst);
}
