// REAL ESTATE TAXES FROM THE ASSESSMENT LETTER.
//
// When the owner has the city's notice of next year's taxable assessed value,
// the budget's tax is not "this year + 3%" — it is the assessment × the
// millage, landing in the month the bill is due. Keyed here as a SEED for the
// Budget Inputs store (like Rite Aid's back-out): it stands until someone types
// the taxes on the grid, and a reset (↺) that clears it stays cleared.
//
// Philadelphia's 2026 rate is 1.3998% of taxable assessed value — City 0.6317%
// + School District 0.7681%, unchanged since 2016 — and a 2027 rate is not yet
// set, so 2027 is budgeted at the current one. The bill is due March 31 (the
// Tax Tracker's due date; paying by the end of February earns a 1% discount,
// which this deliberately does NOT assume).

import type { ExpenseInput } from "./expenseInputs";

/** Philadelphia real estate tax, % of taxable assessed value (City + School). */
export const PHILA_RET_RATE_PCT = 1.3998;

export type AssessedTax = {
  code: string;
  year: number;
  /** Taxable assessed value, from the city's notice. */
  assessed: number;
  ratePct: number;
  /** 1–12: the month the bill is due and the budget carries it. */
  dueMonth: number;
  source: string;
};

export const ASSESSED_TAXES: AssessedTax[] = [
  { code: "7200", year: 2027, assessed: 2_347_900, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: "City of Philadelphia Office of Property Assessment, Notice of Valuation for 2027" },
  { code: "7010", year: 2027, assessed: 13_174_000, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: "City of Philadelphia Office of Property Assessment, Notice of Valuation for 2027" },
];

/** The tax the assessment carries, in whole dollars. */
export const assessedTax = (a: AssessedTax) => Math.round((a.assessed * a.ratePct) / 100);

/** The seeded real-estate-tax input for a property's budget year, if any. */
export function assessedTaxInput(year: number, code: string): ExpenseInput | null {
  const a = ASSESSED_TAXES.find((x) => x.year === year && x.code === String(code).toUpperCase());
  if (!a) return null;
  const months = new Array(12).fill(0);
  months[a.dueMonth - 1] = assessedTax(a);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][a.dueMonth - 1];
  return {
    months,
    note: `$${a.assessed.toLocaleString("en-US")} taxable assessed value × ${a.ratePct}% = $${assessedTax(a).toLocaleString("en-US")}, due ${month} (${a.source})`,
    by: "Assessment notice",
    source: {
      pill: "Per notice",
      title: a.source,
      rows: [
        { label: "Taxable assessed value", value: `$${a.assessed.toLocaleString("en-US")}` },
        { label: "Rate (City + School)", value: `${a.ratePct}%` },
        { label: "Due", value: month },
      ],
      total: { label: `${a.year} real estate tax`, value: `$${assessedTax(a).toLocaleString("en-US")}` },
    },
  };
}
