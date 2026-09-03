// Tenant monthly statements — the shape of one tenant's open account as of a
// statement period, parsed out of the Skyline "Statement" report.
//
// The Skyline export is a Crystal Reports rendering: one statement block per
// tenant, each block a list of OPEN (unpaid) charges plus an "Open Credits"
// line and a reported balance. There is no payment history in it — every line
// is something still owed — which is exactly what a tenant needs to see.

/** Charge buckets we roll up on the statement. Driven off the Skyline
 *  description text (Skyline gives us no charge code on this report). */
export type ChargeCategory =
  | "rent"
  | "cam"
  | "insurance"
  | "ret"
  | "uando"
  | "utilities"
  | "credit"
  | "other";

export const CATEGORY_LABEL: Record<ChargeCategory, string> = {
  rent: "Rent",
  cam: "CAM",
  insurance: "Insurance",
  ret: "Real Estate Tax",
  uando: "Use & Occupancy",
  utilities: "Utilities",
  credit: "Credits",
  other: "Other",
};

/** Display order for category rollups — the order a statement reads best in. */
export const CATEGORY_ORDER: ChargeCategory[] = [
  "rent", "cam", "insurance", "ret", "uando", "utilities", "other", "credit",
];

/** Which section of the laser statement a charge printed under. Skyline splits
 *  a statement into what was already outstanding and what's newly billed, and
 *  the amount due is the sum of the two. */
export type ChargeSection = "prior" | "current";

export type StatementCharge = {
  /** Charge date as YYYY-MM-DD. Null for undated lines (Skyline's aggregate
   *  "Open Credits" row carries no date). */
  dateISO: string | null;
  description: string;
  /** Positive = owed, negative = credit on account. */
  amount: number;
  category: ChargeCategory;
  /** Set on year-end CAM/INS/RET adjustment lines — the reconciliation year the
   *  line settles, so the portal can link straight to that annual statement. */
  reconYear?: number;
  /** The statement section this line printed under. Defaults to "prior" on
   *  records stored before the current-charges section was parsed. */
  section?: ChargeSection;
};

export type TenantStatement = {
  /** Unit reference in the app's canonical form, e.g. "1100-34" — Skyline's
   *  charge-type suffix stripped, so it matches the rent roll, the recon
   *  rosters and the portal token. */
  unitRef: string;
  /** The ref exactly as Skyline printed it, e.g. "1100-34-CU". */
  skylineUnitRef: string;
  /** Leading segment of the unit ref, e.g. "1100". */
  propertyCode: string;
  /** Middle segment, e.g. "34". */
  suite: string;
  tenantName: string;
  /** Remaining lines of the bill-to block (street, city/state/zip). */
  address: string[];
  charges: StatementCharge[];
  /** Skyline's own TOTAL AMOUNT DUE — its PREVIOUS MONTH ENDING BALANCE plus
   *  its TOTAL CURRENT. This, not either subtotal, is what the tenant owes. */
  reportedBalance: number;
  /** Skyline's "PREVIOUS MONTH ENDING BALANCE" — the already-outstanding half. */
  priorBalance?: number;
  /** Skyline's "TOTAL CURRENT" — the newly-billed half. */
  currentTotal?: number;
  /** Sum of the charge lines we parsed. */
  chargeTotal: number;
  /** chargeTotal reconciles to reportedBalance (within a cent). A false here
   *  means the parse missed or double-counted a line — never bill off it. */
  tiesOut: boolean;
  /** Provenance — which upload this tenant's statement came from. Stamped on
   *  merge so a tenant carried over from an earlier file (because the newest
   *  export didn't include them) is identifiable rather than silently stale.
   *  Optional: records stored before provenance existed simply have neither. */
  importedAt?: string;
  sourceFile?: string;
};

/** One uploaded Skyline file within a period's run. */
export type StatementSource = {
  filename: string;
  importedAt: string;
  importedBy: string | null;
  tenantCount: number;
};

/** Every tenant's open account for one statement period. Multiple Skyline
 *  exports (e.g. the SC and BP runs) merge into the one period record. */
export type StatementRun = {
  /** "YYYY-MM" — the month the statement speaks as of. */
  period: string;
  /** Visible on the tenant portal. Imports land unpublished so staff can
   *  review the tie-outs first. */
  published: boolean;
  /** Set when a file was imported despite the export having dropped its
   *  CURRENT CHARGES section. Such a month understates anyone billed this
   *  month, so it can't auto-publish and needs an explicit override to go live. */
  incompleteExport?: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sources: StatementSource[];
  statements: TenantStatement[];
};

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "d90plus";

export const AGING_LABEL: Record<AgingBucket, string> = {
  current: "Current",
  d30: "1–30 days",
  d60: "31–60 days",
  d90: "61–90 days",
  d90plus: "Over 90 days",
};

export const AGING_ORDER: AgingBucket[] = ["current", "d30", "d60", "d90", "d90plus"];
