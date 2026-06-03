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

import { emptyCamConfig, type CamConfig } from "./config";

export type RetailConfigSeedEntry = {
  /** Stipulated pro-rata shares as percents (0–100). When a category is
   *  omitted it falls back to the unit's computed SF share in the card. */
  camPrs?: number;
  insPrs?: number;
  retPrs?: number;
  /** CAM admin fee % (e.g. 10). Applies to CAM only. */
  adminFeePct?: number;
  /** Gross lease — no CAM/INS/RET reconciliation. */
  grossLease?: boolean;
};

export const RETAIL_CONFIG_SEED: Record<string, RetailConfigSeedEntry> = {
  // ── 1100 · Parkwood Professional Center ────────────────────────────────
  // CAM/INS/RET share a single GLA of 8,287 SF; PRS = unit SF ÷ 8,287.
  // CAM admin fee 10%. Vacant suites (30/32/38) carry no methodology.
  "1100-34": { camPrs: 23.338, insPrs: 23.338, retPrs: 23.338, adminFeePct: 10 }, // Shear Sensation
  "1100-36": { camPrs: 13.274, insPrs: 13.274, retPrs: 13.274, adminFeePct: 10 }, // Honest Real Estate
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
  return c;
}
