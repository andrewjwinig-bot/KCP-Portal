// Shape of a parsed property operating budget. One BudgetWorkbook
// corresponds to one uploaded Excel file (e.g. "Shopping Centers 2026
// Operating Budget") and holds one PropertyBudget per property sheet
// inside that workbook.

export type BudgetLine = {
  /** GL account code (e.g. "4230-8501"); null for derived/subtotal rows. */
  glAccount: string | null;
  /** Optional sub-category from column B (e.g. "(SC)" or "Office Direct"). */
  subCategory: string | null;
  /** Line label from column C (e.g. "Rental Income - In Place"). */
  label: string;
  /** Twelve monthly amounts, Jan–Dec. Empty cells become 0. */
  months: number[];
  /** Annual total (as written in the workbook — we don't recompute on import). */
  total: number;
  /** Per-sqft annual total, when the workbook supplies it. */
  totalPsf: number | null;
  /** Author initials from column S, if present. */
  input: string | null;
  /** Free-text notes from column T, if present. */
  notes: string | null;
  /** True when this row is a subtotal / section total (e.g. "Total Rental and
   *  Other", "TOTAL REVENUES"). Stored alongside line items so we can render
   *  the workbook layout faithfully. */
  isSubtotal: boolean;
};

export type BudgetSection = {
  /** Section name from the workbook (e.g. "Revenues", "Reimbursements"). */
  name: string;
  lines: BudgetLine[];
};

export type SkylineImportLine = {
  /** Label from the Budget Import block (col 0). */
  label: string;
  /** GL account code (col 3). */
  glAccount: string;
  /** Twelve monthly amounts Jan–Dec (cols 4–15). Revenues stored as
   *  negatives — Skyline records them as credits. */
  months: number[];
  /** Annual total (col 16) — equals sum(months). */
  total: number;
};

export type PropertyBudget = {
  propertyCode: string;
  propertyName: string;
  rentableSqft: number;
  /** Monthly occupancy %, length 12. */
  occupancyPct: number[];
  /** Monthly occupied SF, length 12. */
  occupancySqft: number[];
  sections: BudgetSection[];
  /** Headline rollups (Total Revenues, NOI, Cash Flow before/after Debt). */
  rollups: { name: string; total: number; months: number[] }[];
  /** The Skyline Import block exactly as it appears at the bottom of the
   *  property sheet — used to generate the .xlsx for the GL system. */
  skylineImport: SkylineImportLine[];
  /** Total of the skylineImport (sanity check — should equal
   *  −1 × Cash Flow After Debt Service). */
  skylineImportTotal: number;
};

export type BudgetCategory = "Shopping Centers" | "Office" | "Residential" | "Other";

export type BudgetWorkbook = {
  id: string;                     // e.g. "shopping-centers-2026"
  label: string;                  // human-readable
  category: BudgetCategory;
  year: number;
  uploadedAt: string;
  uploadedBy?: string;
  /** Workbook-level rollup ("All Shopping Centers" sheet), if present. */
  rollup?: PropertyBudget;
  properties: PropertyBudget[];
};
