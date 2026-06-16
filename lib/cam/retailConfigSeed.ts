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
  /** Manual insurance $ that replaces the property INS pool for this tenant
   *  (e.g. a Wawa outparcel billed on its own liability figure). */
  insPoolOverride?: number;
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
  "1100-34": { camPrs: 23.3378, insPrs: 23.3378, retPrs: 23.3378, adminFeePct: 10 }, // Shear Sensation (1934/8287)
  "1100-36": { camPrs: 13.2738, insPrs: 13.2738, retPrs: 13.2738, adminFeePct: 10 }, // Honest Real Estate (1100/8287)

  // ── 2300 · Brookwood Shopping Center ───────────────────────────────────
  // PRS is NOT seeded here — propertyRules.ts already prefills the correct
  // per-category denominators (CAM 56,572 / INS 48,772 / RET 61,572) and the
  // Wawa (no CAM) / M&T (no INS) carve-outs. Only the CAMPRep extras the card
  // can't derive are seeded: CAM admin fee, Planet Fitness's cap, and the two
  // documented line exclusions. Admin fee is 10% unless noted; Cohen, Lee's
  // Hoagies and Dunkin carry no admin fee (no entry needed). Wawa keeps its
  // real pro-rata CAM share but excludes every CAM line (outparcel maintains
  // its own lot) so its effective CAM pool is $0 — modeled as exclusions, not a
  // forced 0% share, so the unit page and the recon agree on the share.
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
  "2300-1883": { // Wawa — outparcel pays no CAM; RET discount. INS is a special
    // case handled in assemble.ts (billed on the building's Liability Insurance
    // line, not the property INS pool), so it's NOT a per-tenant config field here.
    camPrs: 8.1206,
    retDiscountPct: 2,
    // Every CAM line excluded → effective CAM pool is $0, so CAM share × $0 = $0.
    excludedCamLines: [
      "Maintenance Salaries", "Electric (Common)", "Water / Sewer",
      "Building Maintenance", "Parking Lot Cleaning", "Trash Removal",
      "Security", "Parking Lot Maintenance", "Snow Removal", "Landscaping",
      "Liability Insurance",
    ],
  },
  // Dunkin — no admin fee; CAM excludes Building Maintenance + Security
  // (exact pool match: 23,786 + 27,752.96 = 51,538.96).
  "2300-1885": { retDiscountPct: 2, excludedCamLines: ["Building Maintenance", "Security"] },

  // ── 4500 · Gray's Ferry Shopping Center ────────────────────────────────
  // PRS comes from propertyRules (CAM 82,809 / INS 79,134 / RET 82,809 with
  // Victra's RET on the reduced GLA) EXCEPT Fresh Grocer's CAM PRS, which the
  // lease stipulates at 67.96% (seeded below). Also seeded here: admin fees +
  // line exclusions + the PLCB gross lease. McDonald's and Fresh Grocer exclude
  // Building Maintenance from CAM. Victra (0% admin), USPS (RET only) and
  // Clear Channel (billboard parcel) need no config entry.
  "4500-2851": { adminFeePct: 15, excludedCamLines: ["Building Maintenance"] }, // McDonald's outparcel
  "4500-2891": { adminFeePct: 10 }, // JP Morgan
  "4500-2895": { adminFeePct: 10 }, // Nail Parlor
  "4500-2899": { adminFeePct: 10 }, // Curl & Care
  "4500-3001": { adminFeePct: 10 }, // Hilti
  "4500-3021": { // Fresh Grocer (anchor) — CAM PRS lease-stipulated at 67.96%
    // (overrides the ~68.41% SF share); 5% admin; CAM excludes Building
    // Maintenance; admin fee excludes Liability INS, Security, utilities.
    camPrs: 67.96,
    adminFeePct: 5,
    excludedCamLines: ["Building Maintenance"],
    adminFeeExcludedLines: ["Liability Insurance", "Security", "Electric (Common)", "Water / Sewer"],
  },
  "4500-3009": { grossLease: true }, // PLCB — gross lease

  // ── 7010 · Parkwood Shopping/Office Center (mixed retail + office) ──────
  // PRS is COMPUTED (unit SF / category GLA) via PROPERTY_CAM_RULES["7010"]
  // (CAM/INS 61,036 · RET 73,215 · office 12,179, with pad overrides), so a
  // new tenant auto-calculates. Only admin %, line exclusions and gross
  // leases are stipulated here. Wawa/Dunkin INS exclusion is in the rules.
  // Retail (8502):
  "7010-1230A": { adminFeePct: 0, excludedCamLines: ["Maintenance Salaries", "Building Maintenance", "Liability Insurance"] }, // Wawa (pad) — no admin; CAM excludes salaries, bldg maint, liability ins
  "7010-12315": { adminFeePct: 10 }, // Pat's Pizzaria
  "7010-12319": { adminFeePct: 10 }, // Reen's Deli
  "7010-12325": { adminFeePct: 10 }, // Parkwood Pack & Ship
  "7010-12327": { adminFeePct: 10 }, // The Forge MMA (CAM/INS GLA 73,215 via rules)
  "7010-12329": { adminFeePct: 10 }, // Parkwood Super Valet
  "7010-12331": { adminFeePct: 10 }, // Petroski Physiotherapy (INS GLA 40,388)
  "7010-12333": { adminFeePct: 10 }, // Hong Kong
  "7010-12337": { adminFeePct: 10 }, // Parkwood Hairstylist
  "7010-12339": { adminFeePct: 10 }, // Coldwell Banker
  "7010-12341": { adminFeePct: 10 }, // Hair Wizards (INS GLA 40,388)
  "7010-12343": { adminFeePct: 10 }, // Philadelphia Flower
  "7010-12345": { adminFeePct: 10 }, // Miss Beauty Salon
  "7010-12349": { adminFeePct: 10 }, // North Inc
  "7010-12353": { adminFeePct: 10 }, // Zen Serenity (INS GLA 40,388)
  "7010-12357": { adminFeePct: 10 }, // We Rock the Spectrum (INS GLA 40,388)
  "7010-12360": { adminFeePct: 15, excludedCamLines: ["Building Maintenance"] }, // Trumark Fin. (pad, CAM GLA 76,608)
  "7010-12363": { adminFeePct: 10 }, // Philly Soft Pretzel
  "7010-12375": { adminFeePct: 10, excludedCamLines: ["Building Maintenance"] }, // Dunkin (pad) — CAM excludes bldg maint
  "7010-12361": { grossLease: true }, // Senator Sabatina (retail) — gross
  // Office (8503), pro-rata over 12,179 sf (via rules):
  "7010-203": { adminFeePct: 0 }, // Parkwood Medical
  "7010-201": { grossLease: true },   // Foot & Ankle (office) — gross
  "7010-218": { grossLease: true },   // Parkwood Medical Storage (office) — gross

  // ── 9510 · Shops of Lafayette Hill ─────────────────────────────────────
  // PRS is LEASE-stipulated per tenant (seeded here, not SF-derived). 10% CAM
  // admin (Wawa 0%). No separate INS pool — insurance is the Liability
  // Insurance CAM line — so insPrs is 0 for everyone. RET PRS = CAM PRS (no RET
  // discounts at this center). Wawa (406) excludes the Parking Lot Cap Ex
  // amortization and is billed QUARTERLY (year-end escrow billed = 0; the
  // quarterly billings live on the task tracker — to be linked).
  "9510-406": { camPrs: 21, insPrs: 0, retPrs: 21, adminFeePct: 0, excludedCamLines: ["Parking Lot Cap Ex"] }, // Wawa — 21% lease share (matches the quarterly bill); quarterly billed; no admin
  "9510-408": { camPrs: 5.53, insPrs: 0, retPrs: 5.53, adminFeePct: 10 },   // Vino's Pizza
  "9510-410": { camPrs: 5.441, insPrs: 0, retPrs: 5.441, adminFeePct: 10 }, // Hunan Wok
  "9510-412": { camPrs: 6.28, insPrs: 0, retPrs: 6.28, adminFeePct: 10 },   // Touch of Class
  "9510-414": { camPrs: 5.32, insPrs: 0, retPrs: 5.32, adminFeePct: 10 },   // Hair Concepts
  "9510-420": { camPrs: 8.99, insPrs: 0, retPrs: 8.99, adminFeePct: 10 },   // Lafayette Hill Cleaners
  "9510-422": { camPrs: 4.48, insPrs: 0, retPrs: 4.48, adminFeePct: 10 },   // Liang Jiang
  "9510-424": { camPrs: 4.48, insPrs: 0, retPrs: 4.48, adminFeePct: 10 },   // DKMNK
  "9510-426": { camPrs: 4.48, insPrs: 0, retPrs: 4.48, adminFeePct: 10 },   // Marvel Agency
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
  if (e.insPoolOverride != null) c.insAmountOverride = e.insPoolOverride;
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
