// Assemble retail tenant reconciliation inputs by joining:
//   • the rent-roll roster (SF, escrow billed, RET discount) — seeded here,
//   • per-category PRS from propertyRules.ts (the same denominators + carve-
//     outs the unit-page CAM card prefills), honoring any stipulated PRS, and
//   • the stored CAM config (admin fee, exclusions, cap, gross lease) — by
//     default the CAMPRep seed, but the route passes a resolver that reads the
//     saved config so manual edits flow through.

import type { RetailExpensePool, RetailTenantInput } from "./types";
import { getCategoryDenominator, isTenantExcluded } from "../propertyRules";
import { seedCamConfig } from "../retailConfigSeed";
import { emptyCamConfig, type CamCategory, type CamConfig } from "../config";

export type RetailRosterUnit = {
  unitRef: string;
  suite: string;
  name: string;
  sqft: number;
  vacant?: boolean;
  retDiscountPct?: number;
  /** Override INS pool (Wawa's insurance is the liability line). */
  insPoolOverride?: number;
  camEscrow: number;
  insEscrow: number;
  retEscrow: number;
};

function prsFor(
  propertyCode: string,
  category: CamCategory,
  name: string,
  sqft: number,
  buildingGla: number,
  stipulated: number | null,
): number {
  if (isTenantExcluded(propertyCode, category, name)) return 0;
  if (stipulated != null) return stipulated;
  const denom = getCategoryDenominator(propertyCode, category, name, buildingGla);
  return denom > 0 ? (sqft / denom) * 100 : 0;
}

export function assembleRetail(
  pool: RetailExpensePool,
  roster: RetailRosterUnit[],
  buildingGla: number,
  configFor: (unitRef: string) => CamConfig = (u) => seedCamConfig(u) ?? emptyCamConfig(u),
): RetailTenantInput[] {
  const out: RetailTenantInput[] = [];
  for (const u of roster) {
    if (u.vacant) continue;
    const cfg = configFor(u.unitRef);
    out.push({
      unitRef: u.unitRef,
      suite: u.suite,
      name: u.name,
      sqft: u.sqft,
      camPrs: prsFor(pool.propertyCode, "cam", u.name, u.sqft, buildingGla, cfg.cam.stipulatedPrs),
      insPrs: prsFor(pool.propertyCode, "ins", u.name, u.sqft, buildingGla, cfg.ins.stipulatedPrs),
      retPrs: prsFor(pool.propertyCode, "ret", u.name, u.sqft, buildingGla, cfg.ret.stipulatedPrs),
      adminFeePct: cfg.cam.adminFeePct ?? 0,
      grossLease: cfg.grossLease,
      camExcludedLabels: cfg.camExcludedLines,
      adminExcludedLabels: cfg.camAdminExcludedLines,
      retDiscountPct: u.retDiscountPct ?? 0,
      insPoolOverride: u.insPoolOverride,
      camCap: cfg.camCap
        ? { priorControllable: cfg.camCap.controllableAmount, growthPct: cfg.camCap.growthPct }
        : undefined,
      camEscrow: u.camEscrow,
      insEscrow: u.insEscrow,
      retEscrow: u.retEscrow,
    });
  }
  return out;
}
