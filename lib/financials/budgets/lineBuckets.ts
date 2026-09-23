// BUDGET BUCKETS — the way the owner's workbook budgets a handful of lines:
// not one figure, but a split by what KIND of spend it is.
//
//   Building / Parking Lot Maint., Landscaping → Contractual · Recurring · Big Projects
//   Non-recoverable Building Maint.            → Recurring · Big Projects
//   Insurance                                  → Liability · Property · Other
//   Cleaning & Supplies (business parks)       → Cleaning & Supplies · Vacancies
//
// A bucket is NOT a GL account — the ledger cannot tell a contract from a big
// project — so these replace the account sub-lines on those lines rather than
// sitting beside them. The line is the SUM of its buckets.
//
// The BASE bucket carries the line's existing figure, whatever produced it
// (this year grown, or the figure keyed on Budget Inputs — insurance and
// building maintenance), and is typed exactly as the line was before. Every
// other bucket starts at zero and ADDS to the line — so a $40,000 repaving
// typed into Big Projects raises the budget by $40,000 rather than quietly
// eating the recurring figure. The extras are stored with the typed months,
// keyed `section::label#<bucket>`.

import type { SectionRole } from "@/lib/financials/operating-statements/types";

export type BucketSet = { base: string; buckets: string[] };

const MAINT: BucketSet = { base: "Recurring", buckets: ["Contractual", "Recurring", "Big Projects"] };

export function bucketsFor(role: SectionRole, label: string): BucketSet | null {
  const expense = role === "reimbursable-expense" || role === "non-reimbursable-expense" || role === "residential-expense";
  if (!expense) return null;
  const l = label.trim();
  if (/^(building|bldg\.?)\s*maint/i.test(l)) {
    return role === "non-reimbursable-expense" ? { base: "Recurring", buckets: ["Recurring", "Big Projects"] } : MAINT;
  }
  if (/^parking\s*lot\s*maint/i.test(l)) return MAINT;
  if (/^landscap/i.test(l)) return MAINT;
  if (/^insurance$/i.test(l)) return { base: "Property", buckets: ["Liability", "Property", "Other"] };
  if (/^cleaning\s*(&|and)\s*supplies$/i.test(l)) return { base: "Cleaning & Supplies", buckets: ["Cleaning & Supplies", "Vacancies"] };
  return null;
}
