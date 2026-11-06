// Typed budget months, one document per (budget year, property) — the same
// shape as the leasing assumptions and the Expenses step.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { withCurrentLineKeys } from "@/lib/financials/operating-statements/lineRenames";
import { applyEdit, type LineOverrides } from "./lineOverrides";

const PREFIX = "budget-line-overrides";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

const sep = (amount: number) => { const m: (number | null)[] = new Array(12).fill(null); m[8] = amount; return m; };

/** Figures known from a document rather than typed, laid UNDER the stored
 *  typed months (anything typed on the same key wins). Keyed `<year>-<code>`.
 *  9000 Butler & Main's FLOOD policy (owner, 11/2026): policy 0006262172, new
 *  business 9/15/2026 at $3,757.00 (receipt 188060) — the 2027 renewal in
 *  September at +3%, on the Insurance line's Other bucket. */
export const SEEDED_LINE_OVERRIDES: Record<string, LineOverrides> = {
  "2027-9000": {
    // Parking lot (owner: "somewhere between 1100 and 9510 sized … closer to
    // 1100"): 1100 budgets $3,600 sweeping / $5,000 maintenance, 9510 $16,583 /
    // $21,378. Sweeping $400 a month; maintenance $6,000 recurring, quarterly
    // like 1100 (the line's base bucket); no big project.
    "Reimbursable Expenses::Parking Lot Cleaning": { months: new Array(12).fill(400), by: "Estimate · between 1100 and 9510, closer to 1100 — $400/mo sweeping" },
    "Reimbursable Expenses::Parking Lot Maintenance": { months: [0, 0, 1500, 0, 0, 1500, 0, 0, 1500, 0, 0, 1500], by: "Estimate · $6,000 recurring, quarterly (1100 $5,000 · 9510 $11,078)" },
    // Business taxes: no Philadelphia BIRT in Ambler (9510, our other Montgomery
    // centre, budgets $0) — the PA annual report and any borough business
    // privilege tax, a $500 placeholder in April with the other centres' filings.
    "Non-Reimbursable Expenses::Business Taxes": { months: [0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0], by: "Estimate · PA annual report + any Ambler business privilege tax — confirm with the borough" },
    // Legal & accounting: a new LLC's first full-year return / K-1s and renewals
    // on 8 of 13 leases ending 12/31/2027 — near 1100's $6,939 and 7300's $8,549.
    "Non-Reimbursable Expenses::Legal & Accounting": { months: new Array(12).fill(500), by: "Estimate · first full-year return + 2027 lease renewals (1100 $6,939 · 7300 $8,549)" },
    // Liability — 73% of the $10,000 underwriting (expenseInputStore.ts holds the property part).
    "Reimbursable Expenses::Insurance#Liability": { months: [608, 608, 608, 608, 608, 608, 608, 608, 608, 608, 627, 627], by: "Underwriting $10,000/yr · liability 73%, Nov renewal +3%" },
    "Reimbursable Expenses::Insurance#Other": { months: sep(Math.round(3757 * 1.03)), by: "Flood policy 0006262172 · $3,757 paid 9/15/2026, +3% at renewal" },
  },
};

export async function getLineOverrides(budgetYear: number, propertyCode: string): Promise<LineOverrides> {
  const stored = withCurrentLineKeys(propertyCode, ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as LineOverrides | null) ?? {});
  return { ...(SEEDED_LINE_OVERRIDES[idFor(budgetYear, propertyCode)] ?? {}), ...stored };
}

export async function editLineOverride(
  budgetYear: number, propertyCode: string, key: string, month: number | "all", value: number | null | number[], by: string,
): Promise<LineOverrides> {
  // Edits the STORED doc only — a seed is never written in, so ↺ hands a seeded key back to its seed.
  const stored = withCurrentLineKeys(propertyCode, ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as LineOverrides | null) ?? {});
  const doc = applyEdit(stored, key, month, value, by);
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
  return doc;
}
