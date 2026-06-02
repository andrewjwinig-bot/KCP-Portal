// Office CAM / RET reconciliation — shared shapes.
//
// An office tenant on a base-year lease pays its pro-rata share of the
// amount by which the reconciliation year's operating expenses exceed
// the expenses of its locked base year, prorated for the portion of the
// year it occupied the suite. Real estate taxes run as a parallel
// schedule with their own base-year stop and their own escrow.
//
// This mirrors the per-building CAM workbook (e.g. 4070_2025_CAM_and_RET
// _Billing): the "Expenses & Occ" tab is the OfficeExpensePool, the
// "Tenant Inputs"/"Building" tabs are OfficeTenantInput[], and the
// per-tenant statement + "Year End Adjustments" export are produced by
// lib/cam/office/compute.ts.

/** One operating-expense line in the per-tenant schedule. When a lease is
 *  grossed up (most office tenants → 95% occupancy) the gross-up variant
 *  account is substituted for the base account on the lines that carry one
 *  (Management Fee, Cleaning). */
export type ReconGLLine = {
  /** Base GL account, e.g. "6610-8502". */
  glAccount: string;
  label: string;
  /** Gross-up (95%) variant account when one exists, e.g. "6610-8502-95".
   *  Omitted for lines that are never grossed up. */
  grossUpAccount?: string;
};

/** A building's expense history, by GL account and year. Drives both the
 *  base-year column and the reconciliation-year ("Actual") column of every
 *  tenant statement. */
export type OfficeExpensePool = {
  propertyCode: string;
  /** GL account (including any "-95" variant) → 4-digit year → dollars.
   *  Sparse: a year absent for an account reads as $0, which is what makes
   *  a brand-new tenant whose base year predates any data pay on the full
   *  pool (base costs = 0). */
  values: Record<string, Record<string, number>>;
  /** Ordered operating-expense schedule. Excludes RET and any separately
   *  billed charge (e.g. electric). */
  opexLines: ReconGLLine[];
  /** GL account carrying real estate taxes, run as its own schedule. */
  retAccount: string;
  retLabel: string;
  /** Building rentable SF — the share denominator, for display. */
  rentableSqft?: number;
  updatedAt: string;
};

/** Per-tenant reconciliation inputs. SQFT / pro-rata / dates come from the
 *  December rent roll; baseYear + grossUp from tenant metadata; the escrow
 *  amounts are what the tenant actually paid in CAM/RET estimates during
 *  the year (rent-roll monthly charge × months occupied). */
export type OfficeTenantInput = {
  /** Portal unit ref, e.g. "4070-103". */
  unitRef: string;
  /** Skyline charge-upload unit, e.g. "4070-103-CU". */
  skylineUnit: string;
  suite: string;
  name: string;
  /** 4-digit base year. A base year with no expense data → base costs of
   *  $0 → tenant reconciles against the full pool. */
  baseYear: number;
  /** True when the lease grosses expenses up to 95% occupancy. */
  grossUp: boolean;
  /** Pro-rata share as a percent, e.g. 2.2 means 2.2%. */
  proRataPct: number;
  sqft: number;
  /** Fraction of the year the suite was occupied (0–1) — move-in/move-out
   *  only. 1 for a full-year tenant (a lease expiring mid-year while the
   *  tenant stays is still 1). */
  occPct: number;
  /** Fraction used to prorate the recovery (0–1) = occupancy further capped
   *  at a mid-year base-year reset. Equals occPct when there's no reset. */
  recoveryPct: number;
  /** CAM estimate collected during the year (positive dollars). */
  opexEscrow: number;
  /** RET estimate collected during the year (positive dollars). */
  retEscrow: number;
  /** Current monthly CAM / RET estimate charges from the rent roll
   *  (the "Charges" column on the CAM EST BILLING sheet). */
  camMonthly?: number;
  retMonthly?: number;
  /** ISO date the base year was reset, if any — surfaces a footnote. */
  baseYearResetISO?: string | null;
  /** Rent commencement date (lease start), "M/D/YYYY" — for partial-year
   *  verification. */
  rcd?: string | null;
};

export type ReconScheduleLine = {
  glAccount: string;
  label: string;
  baseCost: number;
  actual: number;
  /** max(0, actual − baseCost) — floored per line. */
  netIncrease: number;
};

export type TenantReconResult = {
  unitRef: string;
  skylineUnit: string;
  suite: string;
  name: string;
  baseYear: number;
  grossUp: boolean;
  proRataPct: number;
  sqft: number;
  /** Occupancy fraction (move-in/move-out only). */
  occPct: number;
  /** Recovery proration = occupancy capped at a mid-year base-year reset. */
  recoveryPct: number;
  isVacant: boolean;
  /** ISO date a base-year reset occurred during the recon year, if any —
   *  drives a footnote and caps the recovery period. */
  baseYearResetISO?: string | null;
  /** True when the base year is after the recon year — nothing is due. */
  futureBaseYear?: boolean;
  /** Rent commencement date (lease start), "M/D/YYYY". */
  rcd?: string | null;
  // Operating expenses
  opexLines: ReconScheduleLine[];
  opexBaseTotal: number;
  opexActualTotal: number;
  opexNetIncrease: number;
  /** netIncrease × proRata × occ. */
  opexAmountDue: number;
  opexEscrow: number;
  /** amountDue − escrow. Negative = credit to tenant. */
  opexBalance: number;
  // Real estate taxes (parallel schedule)
  retLine: ReconScheduleLine;
  retAmountDue: number;
  retEscrow: number;
  retBalance: number;
  /** Current monthly CAM / RET charge from the rent roll (CAM EST BILLING). */
  camMonthly: number;
  retMonthly: number;
};

export type BuildingReconResult = {
  propertyCode: string;
  reconYear: number;
  /** Building rentable SF — the pro-rata share denominator. */
  rentableSqft?: number;
  tenants: TenantReconResult[];
  totals: {
    opexAmountDue: number;
    opexEscrow: number;
    opexBalance: number;
    retAmountDue: number;
    retEscrow: number;
    retBalance: number;
  };
};
