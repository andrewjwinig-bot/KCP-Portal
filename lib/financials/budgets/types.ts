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
  /** Optional sub-line breakdown for parent lines that roll up multiple
   *  detail rows (e.g. Insurance = Gen Liability + Umbrella + Property +
   *  D&O). Parsed from the workbook's supporting tabs (INS RET DEBT,
   *  Building Maint, etc.); the UI renders an expand chevron when present.
   *  Sub-lines reuse the same BudgetLine shape so totals/months/notes all
   *  display identically — they just live one level deeper. */
  subLines?: BudgetLine[];
  /** Allocation context — when this line's dollar amount was computed by
   *  apportioning a portfolio-wide expense across properties (parsed
   *  from the Allocated Expenses tab). One line can carry multiple
   *  allocations when several allocated blocks roll into the same GL
   *  (e.g. Marketing = Marketing Salaries + Marketing direct). The UI
   *  renders one small annotation per allocation under the line label
   *  so staff can audit "where did this number come from". */
  allocations?: AllocationDetail[];
};

export type AllocationDetail = {
  /** The amount this specific allocation contributes to the line. When
   *  multiple allocations sit on the same line, the sum equals the
   *  line's total. */
  propertyAmount: number;
  /** Share of the portfolio total (0–100). Derived as
   *  propertyAmount / portfolioTotal × 100 so it always ties out. */
  sharePct: number;
  /** Workbook block's portfolio-wide total being allocated. */
  portfolioTotal: number;
  /** What the allocation is keyed off. "sqft" when the block uses a
   *  Reimbursement % column (sqft share); "annual" when the block lists
   *  an annual dollar amount per property directly. */
  basis: "sqft" | "annual" | "other";
  /** Label of the Allocated Expenses block (e.g. "Marketing Salaries"). */
  blockLabel: string;
  /** GL code from the Allocated Expenses block. */
  glAccount?: string;
  /** Optional source note from the block ("From 2026 Payroll Budget",
   *  "2025 amt grown 3%", etc.). */
  sourceNote?: string;
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

/** One row of the per-tenant "who makes up Occupancy SF each month" panel.
 *
 *  category:
 *    "in-place" — lease was already in place going into the year and
 *                 covers all 12 months.
 *    "renewal"  — lease expires during the budget year. The row carries
 *                 the tenant's footprint through the expiration month;
 *                 post-expiration months are zero until a Renew & Vac
 *                 assumption is set (Phase 2b).
 *    "new"      — lease starts during the budget year (already signed in
 *                 the rent roll). Contributes from the start month on.
 *    "vacant"   — currently vacant suite; zero across the board until a
 *                 new-lease assumption is set (Phase 2b).
 */
export type OccupancyDetailRow = {
  unitRef: string;
  tenantName: string;
  category: "in-place" | "renewal" | "new" | "vacant";
  unitSqft: number;
  /** 12 entries Jan–Dec — sqft attributed to this row per month. */
  monthlySqft: number[];
  /** 12 entries Jan–Dec — base rent attributed to this row per month. */
  monthlyBaseRent: number[];
  leaseFrom: string | null;
  leaseTo: string | null;
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
  /** Per-unit projected occupancy breakdown (in-place / renewal / new /
   *  vacant). Drives the expandable "who's in here each month" panel
   *  under the occupancy strip. Optional because imported workbooks
   *  don't carry per-tenant lease data — only live builds populate it. */
  occupancyDetail?: OccupancyDetailRow[];
  /** The Skyline Import block exactly as it appears at the bottom of the
   *  property sheet — used to generate the .xlsx for the GL system. */
  skylineImport: SkylineImportLine[];
  /** Total of the skylineImport (sanity check — should equal
   *  −1 × Cash Flow After Debt Service). */
  skylineImportTotal: number;
};

export type BudgetCategory = "Shopping Centers" | "Office" | "Residential" | "Other";

/** Kind = "imported" → a parsed source workbook (the historical 2026 file).
 *  Kind = "live"     → a portal-built budget populated from rent roll +
 *  debt tracker + prior budget at × growth. Both share the same shape so
 *  the viewer is identical. */
export type BudgetKind = "imported" | "live";

export type BudgetWorkbook = {
  id: string;                     // e.g. "shopping-centers-2026"
  label: string;                  // human-readable
  kind: BudgetKind;
  category: BudgetCategory;
  year: number;
  uploadedAt: string;
  uploadedBy?: string;
  /** Provenance for live budgets — which rent roll snapshot the in-place
   *  revenue came from, which prior budget OpEx was lifted from, and what
   *  growth multiplier was applied. */
  source?: {
    rentRollUploadedAt?: string;
    priorBudgetId?: string;
    opExGrowthPct?: number;
  };
  /** Workbook-level rollup ("All Shopping Centers" sheet), if present. */
  rollup?: PropertyBudget;
  properties: PropertyBudget[];
};
