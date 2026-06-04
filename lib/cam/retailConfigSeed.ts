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
  /** RET discount % (lease-negotiated reduction of the RET share, e.g. 2). */
  retDiscountPct?: number;
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
  "2300-1817": { adminFeePct: 10, retDiscountPct: 2, excludedCamLines: ["Building Maintenance"] }, // M&T Bank — CAM excludes Bldg Maintenance
  "2300-1847": { adminFeePct: 10 }, // Crafty Crab
  "2300-1851": { // Planet Fitness (National Fitness Partners) — 7% admin + CAM cap
    adminFeePct: 7,
    retDiscountPct: 2,
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
    retDiscountPct: 2,
    adminFeeExcludedLines: ["Liability Insurance", "Electric (Common)", "Water / Sewer"],
  },
  "2300-1869": { adminFeePct: 10 }, // China Sun
  "2300-1877": { adminFeePct: 10 }, // Evolve Nails
  "2300-1879": { adminFeePct: 10 }, // GNC / Live Well
  "2300-1881": { adminFeePct: 10, retDiscountPct: 2 }, // Citizens Bank
  "2300-1883": { retDiscountPct: 2 }, // Wawa (PRS via propertyRules) — RET discount
  // Dunkin — no admin fee; CAM excludes Building Maintenance + Security
  // (exact pool match: 23,786 + 27,752.96 = 51,538.96).
  "2300-1885": { retDiscountPct: 2, excludedCamLines: ["Building Maintenance", "Security"] },

  // ── 4500 · Gray's Ferry Shopping Center ────────────────────────────────
  // PRS comes from propertyRules (CAM 82,809 / INS 79,134 / RET 82,809 with
  // Victra's RET on the reduced GLA). Seeded here: admin fees + line
  // exclusions + the PLCB gross lease. McDonald's and Fresh Grocer exclude
  // Building Maintenance from CAM. Victra (0% admin), USPS (RET only) and
  // Clear Channel (billboard parcel) need no config entry.
  "4500-2851": { adminFeePct: 15, excludedCamLines: ["Building Maintenance"] }, // McDonald's outparcel
  "4500-2891": { adminFeePct: 10 }, // JP Morgan
  "4500-2895": { adminFeePct: 10 }, // Nail Parlor
  "4500-2899": { adminFeePct: 10 }, // Curl & Care
  "4500-3001": { adminFeePct: 10 }, // Hilti
  "4500-3021": { // Fresh Grocer (anchor) — 5% admin; CAM excludes Building
    // Maintenance; admin fee excludes Liability INS, Security, utilities.
    adminFeePct: 5,
    excludedCamLines: ["Building Maintenance"],
    adminFeeExcludedLines: ["Liability Insurance", "Security", "Electric (Common)", "Water / Sewer"],
  },
  "4500-3009": { grossLease: true }, // PLCB — gross lease

  // ── 7010 · Parkwood Shopping/Office Center (mixed retail + office) ──────
  // Per-tenant PRS + admin live here (the unit-page source of truth); the
  // reconciliation reads them from here. The roster only carries rent-roll
  // facts (SF, escrow billed, occupancy) and the pad CAM-pool overrides.
  // Retail (8502):
  "7010-1230A": { camPrs: 10.218560, insPrs: 0, retPrs: 8.518746, adminFeePct: 0, excludedCamLines: ["Maintenance Salaries", "Building Maintenance", "Liability Insurance"] }, // Wawa (pad) — no INS, no admin; CAM excludes salaries, bldg maint, liability ins
  "7010-12315": { camPrs: 5.242808, insPrs: 5.242808, retPrs: 4.370689, adminFeePct: 10 }, // Pat's Pizzaria
  "7010-12319": { camPrs: 7.339931, insPrs: 7.339931, retPrs: 6.118965, adminFeePct: 10 }, // Reen's Deli
  "7010-12325": { camPrs: 2.359263, insPrs: 2.359263, retPrs: 1.966810, adminFeePct: 10 }, // Parkwood Pack & Ship
  "7010-12327": { camPrs: 2.797241, insPrs: 2.797241, retPrs: 2.797241, adminFeePct: 10 }, // The Forge MMA
  "7010-12329": { camPrs: 2.621404, insPrs: 2.621404, retPrs: 2.185345, adminFeePct: 10 }, // Parkwood Super Valet
  "7010-12331": { camPrs: 3.932106, insPrs: 5.942359, retPrs: 3.278017, adminFeePct: 10 }, // Petroski Physiotherapy
  "7010-12333": { camPrs: 2.064355, insPrs: 2.064355, retPrs: 1.720959, adminFeePct: 10 }, // Hong Kong
  "7010-12337": { camPrs: 3.145685, insPrs: 3.145685, retPrs: 2.622413, adminFeePct: 10 }, // Parkwood Hairstylist
  "7010-12339": { camPrs: 2.424798, insPrs: 2.424798, retPrs: 2.021444, adminFeePct: 10 }, // Coldwell Banker
  "7010-12341": { camPrs: 2.424798, insPrs: 3.664455, retPrs: 2.021444, adminFeePct: 10 }, // Hair Wizards
  "7010-12343": { camPrs: 2.359263, insPrs: 2.359263, retPrs: 1.966810, adminFeePct: 10 }, // Philadelphia Flower
  "7010-12345": { camPrs: 2.359263, insPrs: 2.359263, retPrs: 1.966810, adminFeePct: 10 }, // Miss Beauty Salon
  "7010-12349": { camPrs: 6.299561, insPrs: 6.299561, retPrs: 5.251656, adminFeePct: 10 }, // North Inc
  "7010-12353": { camPrs: 3.550364, insPrs: 5.365455, retPrs: 2.959776, adminFeePct: 10 }, // Zen Serenity
  "7010-12357": { camPrs: 5.426306, insPrs: 8.200456, retPrs: 4.523663, adminFeePct: 10 }, // We Rock the Spectrum
  "7010-12360": { camPrs: 2.976190, insPrs: 3.735500, retPrs: 3.114116, adminFeePct: 15, excludedCamLines: ["Building Maintenance"] }, // Trumark Fin. (pad) — CAM excludes bldg maint
  "7010-12363": { camPrs: 3.257094, insPrs: 3.257094, retPrs: 2.715291, adminFeePct: 10 }, // Philly Soft Pretzel
  "7010-12375": { camPrs: 5.242808, insPrs: 0, retPrs: 4.370689, adminFeePct: 10, excludedCamLines: ["Building Maintenance"] }, // Dunkin (pad) — no INS; CAM excludes bldg maint
  "7010-12361": { grossLease: true }, // Senator Sabatina (retail) — gross
  // Office (8503), pro-rata over 12,179 sf:
  "7010-203": { camPrs: 17.710814, insPrs: 17.710814, retPrs: 17.710814, adminFeePct: 0 }, // Parkwood Medical
  "7010-201": { grossLease: true },   // Foot & Ankle (office) — gross
  "7010-218": { grossLease: true },   // Parkwood Medical Storage (office) — gross
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
  if (e.retDiscountPct != null) c.retDiscountPct = e.retDiscountPct;
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
