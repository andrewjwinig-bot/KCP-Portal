// Retail CAM / INS / RET reconciliation — shared shapes.
//
// Unlike the office base-year engine, a retail tenant pays a straight
// pro-rata share of three current-year pools:
//   • CAM  — operating expenses (admin fee added), with per-tenant line
//            exclusions and an optional lease cap on controllable expenses.
//   • INS  — property insurance (no admin fee).
//   • RET  — real estate taxes (no admin fee; some leases take a discount).
// Each less the escrow/estimates billed during the year.

/** One CAM operating-expense line in the building pool. */
export type RetailCamLine = {
  glAccount: string;
  label: string;
  amount: number;
  /** Non-controllable (utilities / snow / insurance) — excluded from the
   *  controllable base when a lease caps controllable CAM growth. */
  nonControllable?: boolean;
};

/** A retail property's current-year reconciliation pools. */
export type RetailExpensePool = {
  propertyCode: string;
  reconYear: number;
  camLines: RetailCamLine[];
  /** Property-insurance pool (the INS category's denominator-numerator). */
  insAmount: number;
  /** Real-estate-tax pool. */
  retAmount: number;
};

/** Per-tenant reconciliation inputs (PRS resolved from propertyRules, the
 *  rest from the stored CAM config + the rent roll). */
export type RetailTenantInput = {
  unitRef: string;
  suite: string;
  name: string;
  sqft: number;
  /** Pro-rata shares as percents (0 when carved out of a category). */
  camPrs: number;
  insPrs: number;
  retPrs: number;
  /** CAM admin fee % (0 = none). */
  adminFeePct: number;
  /** Gross lease — no reconciliation at all. */
  grossLease: boolean;
  /** CAM line labels this tenant isn't billed for. */
  camExcludedLabels: string[];
  /** CAM line labels the admin fee does not apply to. */
  adminExcludedLabels: string[];
  /** RET discount % off the tenant's RET share (e.g. 2). */
  retDiscountPct: number;
  /** Override INS pool (e.g. Wawa's insurance is the liability line). */
  insPoolOverride?: number;
  /** Lease cap on controllable CAM: cap = min(controllable, priorControllable
   *  × (1+growth)). */
  camCap?: { priorControllable: number; growthPct: number };
  /** Estimates billed during the year, per category. */
  camEscrow: number;
  insEscrow: number;
  retEscrow: number;
};

export type RetailTenantResult = {
  unitRef: string;
  suite: string;
  name: string;
  sqft: number;
  grossLease: boolean;
  camPrs: number;
  insPrs: number;
  retPrs: number;
  adminFeePct: number;
  retDiscountPct: number;
  /** Effective CAM pool this tenant is billed against (after exclusions/cap). */
  camPoolEffective: number;
  capped: boolean;
  camShare: number;
  camAdmin: number;
  camDue: number;
  camEscrow: number;
  camBalance: number;
  insDue: number;
  insEscrow: number;
  insBalance: number;
  retDue: number;
  retEscrow: number;
  retBalance: number;
};

export type RetailBuildingResult = {
  propertyCode: string;
  reconYear: number;
  tenants: RetailTenantResult[];
  totals: {
    camDue: number; camEscrow: number; camBalance: number;
    insDue: number; insEscrow: number; insBalance: number;
    retDue: number; retEscrow: number; retBalance: number;
  };
};
