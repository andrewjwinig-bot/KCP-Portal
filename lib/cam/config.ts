// Per-tenant CAM / INS / RET reconciliation configuration.
//
// Most retail tenants pay a pro-rata share of CAM (operating), INS
// (insurance), and RET (real estate taxes). Each category can carry:
//   - a stipulated PRS that overrides the unit's true square-foot share
//   - an admin fee % (0 / 5 / 10 most often, occasionally custom)
//
// CAM-specific extras: a lease may exclude certain CAM lines from the
// admin-fee calculation, and may also exclude certain CAM lines entirely
// from the tenant's bill. INS and RET are not part of CAM, so they carry
// only the simpler PRS + admin fee.
//
// A gross-lease flag short-circuits everything — when set, the tenant
// owes no CAM / INS / RET reconciliation regardless of the other fields.

export const CAM_CATEGORIES = ["cam", "ins", "ret"] as const;
export type CamCategory = (typeof CAM_CATEGORIES)[number];

export const CAM_CATEGORY_LABELS: Record<CamCategory, string> = {
  cam: "CAM",
  ins: "INS",
  ret: "RET",
};

// Standard retail-property CAM line items. Used as the option set for
// both the "admin applies to" picker and the "excluded lines" picker.
// Tenants may customise the list at the tenant level if needed (free-form
// strings are kept on save, so unknown lines from older configs survive).
export const CAM_LINE_ITEMS = [
  "Water / Sewer",
  "Building Maintenance",
  "Maintenance Salaries",
  "Trash Removal",
  "Parking Lot Maintenance",
  "Security",
  "Snow Removal",
  "Landscaping",
  "Management Fee",
  "Cleaning",
  "Electric (Common)",
  "Gas (Common)",
  "Pest Control",
  "Sprinkler / Fire Safety",
  "Sign Maintenance",
] as const;

export type CamCategoryConfig = {
  /** Lease-stipulated PRS % (0–100). Overrides the unit's true PRS for
   *  reconciliation when set. Null/undefined → use true PRS. */
  stipulatedPrs: number | null;
  /** Admin fee %, e.g. 5 means 5%. Null/undefined → no admin fee. */
  adminFeePct: number | null;
};

/**
 * Lease-level CAM expense cap. Currently used by one tenant —
 * National Fitness Partners at 2300 — whose lease caps CAM at the
 * lesser of (current-year applicable CAM × PRS) or (prior-year
 * controllable expenses × growth × PRS). The "controllable" base must
 * be updated each year — bump `priorYear` and `controllableAmount` to
 * the new prior year when reconciling, and the displayed cap recomputes
 * against it. Kept optional so other tenants' configs stay simple.
 */
export type CamCap = {
  /** Year that controllableAmount refers to (cap applies to priorYear + 1). */
  priorYear: number;
  /** Prior-year controllable operating expenses in $. */
  controllableAmount: number;
  /** Annual growth applied to the prior-year amount, in % (typical = 4). */
  growthPct: number;
  /** Free-text reminder shown next to the cap fields. */
  notes: string;
};

export type CamConfig = {
  unitRef: string;
  /** When true the tenant pays gross rent — no CAM/INS/RET reconciliation.
   *  Default false (i.e. NNN). */
  grossLease: boolean;
  /** When true the admin fee skips one or more CAM lines — reveals the
   *  "Excluded from Admin Fee" picker in the UI. Default false. */
  hasAdminFeeExclusions: boolean;
  /** When true some CAM lines aren't billed to this tenant at all —
   *  reveals the "Excluded CAM lines" picker in the UI. Default false. */
  hasExpenseExclusions: boolean;
  cam: CamCategoryConfig;
  ins: CamCategoryConfig;
  ret: CamCategoryConfig;
  /** CAM lines the admin fee does NOT apply to (subset of CAM_LINE_ITEMS
   *  plus any custom lines). Empty → admin fee applies to every CAM line. */
  camAdminExcludedLines: string[];
  /** CAM lines this tenant is NOT billed for (lease-specific exclusions). */
  camExcludedLines: string[];
  /** Optional CAM cap rider (outlier — currently only NFP at 2300). */
  camCap?: CamCap;
  updatedAt: string;
};

export function emptyCamConfig(unitRef: string): CamConfig {
  return {
    unitRef,
    grossLease: false,
    hasAdminFeeExclusions: false,
    hasExpenseExclusions: false,
    cam: { stipulatedPrs: null, adminFeePct: null },
    ins: { stipulatedPrs: null, adminFeePct: null },
    ret: { stipulatedPrs: null, adminFeePct: null },
    camAdminExcludedLines: [],
    camExcludedLines: [],
    updatedAt: new Date().toISOString(),
  };
}

function asPct(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  // Allow 0–100; clamp to three decimals (needed so the PRS round-trips
  // back to the right building-SF denominator for centers with reduced
  // CAM/INS denominators, e.g. Brookwood).
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 1000) / 1000;
}

function asCategory(value: unknown): CamCategoryConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    stipulatedPrs: asPct(v.stipulatedPrs),
    adminFeePct: asPct(v.adminFeePct),
  };
}

function asCamCap(value: unknown): CamCap | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const priorYear = Number(v.priorYear);
  const controllableAmount = Number(v.controllableAmount);
  const growthPctRaw = Number(v.growthPct);
  if (!Number.isFinite(priorYear) || priorYear < 1900 || priorYear > 2100) return undefined;
  if (!Number.isFinite(controllableAmount) || controllableAmount < 0) return undefined;
  const growthPct = Number.isFinite(growthPctRaw) ? Math.max(0, Math.min(100, growthPctRaw)) : 4;
  return {
    priorYear: Math.round(priorYear),
    controllableAmount: Math.round(controllableAmount * 100) / 100,
    growthPct: Math.round(growthPct * 100) / 100,
    notes: typeof v.notes === "string" ? v.notes.slice(0, 500) : "",
  };
}

function asLineList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, 80);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Coerce an untrusted JSON body into a clean CamConfig (unitRef supplied
 *  by the caller, updatedAt stamped by the storage layer).
 *
 *  Legacy migration: an older shape carried a single boolean
 *  `hasExclusions` that gated BOTH exclusion pickers. When a record only
 *  has the legacy field we light up each new flag only if its underlying
 *  list is non-empty, so the user doesn't see an empty picker pop up. */
export function sanitizeCamConfig(unitRef: string, body: unknown): CamConfig {
  const b = (body ?? {}) as Record<string, unknown>;
  const camAdminExcludedLines = asLineList(b.camAdminExcludedLines);
  const camExcludedLines = asLineList(b.camExcludedLines);

  const legacyHasExclusions = b.hasExclusions === true;
  const hasAdminFeeExclusions = b.hasAdminFeeExclusions === true
    ? true
    : legacyHasExclusions && camAdminExcludedLines.length > 0;
  const hasExpenseExclusions = b.hasExpenseExclusions === true
    ? true
    : legacyHasExclusions && camExcludedLines.length > 0;

  return {
    unitRef,
    grossLease: b.grossLease === true,
    hasAdminFeeExclusions,
    hasExpenseExclusions,
    cam: asCategory(b.cam),
    ins: asCategory(b.ins),
    ret: asCategory(b.ret),
    camAdminExcludedLines,
    camExcludedLines,
    camCap: asCamCap(b.camCap),
    updatedAt: new Date().toISOString(),
  };
}
