// Retail CAM/INS/RET config seed — the CAMPRep methodology (pro-rata shares
// + CAM admin fee + gross-lease flag) pulled from each retail property's CAM
// billing workbook, keyed by unit ref. The storage layer falls back to this
// whenever a tenant has NO saved config yet, so a new building's tenant pages
// come up pre-populated instead of blank. The moment staff edit (and save) a
// tenant's CAM card, that saved config wins and the seed is no longer used —
// so this never overwrites manual work.
//
// Backfill workflow: parse a "<Property> CAM Billings" workbook's tenant
// table (Suite Id / Square Footage / PRS / Admin Fee, plus per-category GLA),
// compute each category's PRS = unit SF ÷ category GLA, and add the rows here.
// Vacant suites and gross-lease tenants are handled (grossLease: true).

import { emptyCamConfig, type CamConfig, type CamCap } from "./config";

export type RetailConfigSeedEntry = {
  /** Stipulated pro-rata shares as percents (0–100). When a category is
   *  omitted it falls back to the unit's computed SF share in the card
   *  (which already honors per-property denominators in propertyRules.ts). */
  camPrs?: number;
  insPrs?: number;
  retPrs?: number;
  /** CAM admin fee % (e.g. 10). Applies to CAM only. */
  adminFeePct?: number;
  /** Gross lease — no CAM/INS/RET reconciliation. */
  grossLease?: boolean;
  /** Lease-level CAM cap (e.g. Planet Fitness at Brookwood). */
  camCap?: CamCap;
  /** CAM lines the admin fee does NOT apply to (turns on the admin-fee
   *  exclusion picker). */
  adminFeeExcludedLines?: string[];
  /** CAM lines this tenant isn't billed for at all (turns on the expense
   *  exclusion picker). */
  excludedCamLines?: string[];
};

export const RETAIL_CONFIG_SEED: Record<string, RetailConfigSeedEntry> = {
  // ── 1100 · Parkwood Professional Center ────────────────────────────────
  // CAM/INS/RET share a single GLA of 8,287 SF; PRS = unit SF ÷ 8,287.
  // CAM admin fee 10%. Vacant suites (30/32/38) carry no methodology.
  "1100-34": { camPrs: 23.338, insPrs: 23.338, retPrs: 23.338, adminFeePct: 10 }, // Shear Sensation
  "1100-36": { camPrs: 13.274, insPrs: 13.274, retPrs: 13.274, adminFeePct: 10 }, // Honest Real Estate

  // ── 2300 · Brookwood Shopping Center ───────────────────────────────────
  // PRS is NOT seeded here — propertyRules.ts already prefills the correct
  // per-category denominators (CAM 56,572 / INS 48,772 / RET 61,572) and the
  // Wawa (no CAM) / M&T (no INS) carve-outs. Only the CAMPRep extras the card
  // can't derive are seeded: CAM admin fee, Planet Fitness's cap, and the two
  // documented line exclusions. Admin fee is 10% unless noted; Cohen, Lee's
  // Hoagies and Dunkin carry no admin fee (no entry needed). Wawa is handled
  // entirely by propertyRules.
  "2300-1817": { adminFeePct: 10, excludedCamLines: ["Building Maintenance"] }, // M&T Bank — CAM excludes Bldg Maintenance
  "2300-1847": { adminFeePct: 10 }, // Crafty Crab
  "2300-1851": { // Planet Fitness (National Fitness Partners) — 7% admin + CAM cap
    adminFeePct: 7,
    camCap: {
      priorYear: 2024,
      controllableAmount: 105457,
      growthPct: 4,
      notes: "Cap = lesser of current-year controllable or 2024 controllable ($105,457) x 1.04 = $109,675, plus uncontrollable (utilities, snow, insurance). Workbook flags 2024 base may s/b $101,401 — confirm.",
    },
  },
  "2300-1861": { adminFeePct: 10 }, // Edible Arrangements
  "2300-1867": { // T-Mobile — 7% admin; admin fee excludes Liability INS + utilities
    adminFeePct: 7,
    adminFeeExcludedLines: ["Liability Insurance", "Electric (Common)", "Water / Sewer"],
  },
  "2300-1869": { adminFeePct: 10 }, // China Sun
  "2300-1877": { adminFeePct: 10 }, // Evolve Nails
  "2300-1879": { adminFeePct: 10 }, // GNC / Live Well
  "2300-1881": { adminFeePct: 10 }, // Citizens Bank
};

/** Build a full CamConfig for a unit from its seed entry, or null when the
 *  unit isn't seeded. Pure — safe to import from server or client. */
export function seedCamConfig(unitRef: string): CamConfig | null {
  const e = RETAIL_CONFIG_SEED[unitRef];
  if (!e) return null;
  const c = emptyCamConfig(unitRef);
  if (e.grossLease) c.grossLease = true;
  if (e.camPrs != null) c.cam.stipulatedPrs = e.camPrs;
  if (e.insPrs != null) c.ins.stipulatedPrs = e.insPrs;
  if (e.retPrs != null) c.ret.stipulatedPrs = e.retPrs;
  if (e.adminFeePct != null) c.cam.adminFeePct = e.adminFeePct;
  if (e.camCap) c.camCap = e.camCap;
  if (e.adminFeeExcludedLines?.length) {
    c.hasAdminFeeExclusions = true;
    c.camAdminExcludedLines = [...e.adminFeeExcludedLines];
  }
  if (e.excludedCamLines?.length) {
    c.hasExpenseExclusions = true;
    c.camExcludedLines = [...e.excludedCamLines];
  }
  return c;
}
