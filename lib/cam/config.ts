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

export type CamConfig = {
  unitRef: string;
  /** When true the tenant pays gross rent — no CAM/INS/RET reconciliation.
   *  Default false (i.e. NNN). */
  grossLease: boolean;
  /** When true the lease carves out specific exclusions — either some CAM
   *  lines are excluded from the admin fee, or some CAM lines aren't
   *  billed to this tenant. Default false (admin on all, every line
   *  billed). */
  hasExclusions: boolean;
  cam: CamCategoryConfig;
  ins: CamCategoryConfig;
  ret: CamCategoryConfig;
  /** CAM lines the admin fee does NOT apply to (subset of CAM_LINE_ITEMS
   *  plus any custom lines). Empty → admin fee applies to every CAM line. */
  camAdminExcludedLines: string[];
  /** CAM lines this tenant is NOT billed for (lease-specific exclusions). */
  camExcludedLines: string[];
  updatedAt: string;
};

export function emptyCamConfig(unitRef: string): CamConfig {
  return {
    unitRef,
    grossLease: false,
    hasExclusions: false,
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
 *  by the caller, updatedAt stamped by the storage layer). */
export function sanitizeCamConfig(unitRef: string, body: unknown): CamConfig {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    unitRef,
    grossLease: b.grossLease === true,
    hasExclusions: b.hasExclusions === true,
    cam: asCategory(b.cam),
    ins: asCategory(b.ins),
    ret: asCategory(b.ret),
    camAdminExcludedLines: asLineList(b.camAdminExcludedLines),
    camExcludedLines: asLineList(b.camExcludedLines),
    updatedAt: new Date().toISOString(),
  };
}
