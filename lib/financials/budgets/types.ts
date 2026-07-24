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
  /** Fee rate (as a percentage, e.g. 6 for 6%) when the line's value is
   *  driven by a percentage formula in the workbook — currently set on
   *  the Management Fee lines so the page can render "Management Fee
   *  (6%)" inline. Varies by property. */
  feePercent?: number;
  /** Fund-level rollups (JV III / NI LLC Consolidated) where the
   *  underlying buildings carry different fee rates — the rollup
   *  itself doesn't have a single rate, just the range. Renders as
   *  "(4–6%)". */
  feePercentRange?: [number, number];
  /** Allocation context — when this line's dollar amount was computed by
   *  apportioning a portfolio-wide expense across properties (parsed
   *  from the Allocated Expenses tab). One line can carry multiple
   *  allocations when several allocated blocks roll into the same GL
   *  (e.g. Marketing = Marketing Salaries + Marketing direct). The UI
   *  renders one small annotation per allocation under the line label
   *  so staff can audit "where did this number come from". */
  allocations?: AllocationDetail[];
  /** Per-tenant breakdown of a single-property line. Used by The Office
   *  Works' "CIP Memberships" line, whose monthly total ties out to the
   *  CIP roster on the Monthly Rent Roll & CIP supporting tab — a click-
   *  to-open modal lists every CIP member with their monthly billing. */
  cipDetail?: CipDetail;
  /** Per-tenant rent roster — every tenant paying base rent on this
   *  property, with their monthly billing across Jan–Dec. Drives the
   *  "who's paying what" modal that opens off the "Total Rental and
   *  Other" subtotal. Stage 1 only carries `in-place` tenants from the
   *  In Place Revenue supporting tab; stage 2 will fold in renewal and
   *  new-lease assumptions from the Renew & Vac tab. */
  rentDetail?: RentDetail;
  /** Editor display label ("DREW", "NANCY", "ALISON") + ISO timestamp
   *  for the most recent edit to this line during a reforecast. Lets
   *  the page render "Greg edited Insurance · 2m ago" so staff
   *  collaborating on the same workbook can see who touched what. */
  lastEditedBy?: string;
  lastEditedAt?: string;
};

export type RentRosterEntry = {
  unitRef: string;
  tenantName: string;
  /** "Headline" bucket for the row — most-certain category seen across
   *  the 12 months. Used for legend counts; cell rendering uses
   *  `monthCategories` so mid-year transitions (lease ends Mar →
   *  vacant Apr-Jun → new lease Jul-Dec) colour-shift across the row. */
  category: "in-place" | "renewal" | "new" | "vacant";
  /** Per-month certainty bucket. Index 0 = Jan, 11 = Dec. Always
   *  length 12. Derived by cross-referencing the Rental Summary
   *  amount against the In Place Revenue ledger (an active RNT
   *  charge → in-place) and the Renew & Vac tab (the rest of the
   *  amount is renewal or new-lease assumption depending on which
   *  side of R&V the suite sits on). */
  monthCategories: ("in-place" | "renewal" | "new" | "vacant")[];
  /** 12 monthly amounts Jan–Dec. */
  months: number[];
  /** Sum across months — should tie to the parent line's contribution. */
  total: number;
  /** Lease start / expiration as the workbook reports them (formatted
   *  date string like "11/1/26" or the literal "M-M"). Sourced from
   *  the Renew & Vac tab where the suite appears; in-place leases
   *  whose expiration falls outside the budget year don't surface a
   *  date because the workbook only carries the expiring set. */
  leaseFrom?: string;
  leaseTo?: string;
  /** Unit's full rentable SF. Stamped at GET time from the portal's
   *  rent-roll snapshot so the per-suite occupancy modal can show
   *  how the monthly occupancy SF on the strip breaks down by
   *  tenant. Undefined when no matching rent-roll unit exists yet. */
  sqft?: number;
};

export type RentDetail = {
  entries: RentRosterEntry[];
  /** Sum of every entry's total. */
  total: number;
};

export type CipDetail = {
  tenants: Array<{
    name: string;
    /** 12 entries Jan–Dec. */
    months: number[];
    total: number;
  }>;
  /** Sum across tenants — should tie to the parent line's `total`. */
  total: number;
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
  /** Full per-property breakdown of the allocation block — used by the
   *  click-to-open modal so staff can see exactly how the portfolio
   *  total split across every property. Sorted by property code. */
  rows?: AllocationBlockRow[];
};

/** One row in an allocation block — a single property's slice of the
 *  portfolio-wide expense. */
export type AllocationBlockRow = {
  propertyCode: string;
  sqft: number;
  sharePct: number;
  /** 12 monthly amounts Jan–Dec. */
  months: number[];
  total: number;
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
  /** Reforecast mode — when true, every monthly cell + notes field on
   *  the page becomes inline-editable, with autosave + last-edited-by
   *  tracking. Persisted on the workbook so multiple staff can
   *  collaborate on the same reforecast concurrently. Toggled via
   *  PATCH /api/financials/budgets/[id] { reforecasting }. */
  reforecasting?: boolean;
  /** Who toggled the most recent reforecast on / off and when. */
  reforecastBy?: string;
  reforecastAt?: string;
  /** Snapshot of the property sections + rollups + occupancy strips
   *  captured the moment a reforecast starts. Lets staff click
   *  Discard to roll back to the pre-reforecast state if they were
   *  only testing the flow. Cleared when a reforecast is committed
   *  (Save) or discarded. */
  reforecastSnapshot?: {
    properties: PropertyBudget[];
    rollup?: PropertyBudget;
  };
};
