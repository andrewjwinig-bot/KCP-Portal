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
  /** Fraction of the year occupied (0–1); defaults to 1. */
  occPct?: number;
  retDiscountPct?: number;
  /** Override INS pool (Wawa's insurance is the liability line). */
  insPoolOverride?: number;
  /** Fixed RET charge (own-parcel billboard) that replaces the pro-rata RET. */
  flatRet?: number;
  // Explicit per-tenant overrides for bespoke mixed-use centers (7010). When
  // provided they win over the propertyRules/SF computation.
  camPrs?: number;
  insPrs?: number;
  retPrs?: number;
  adminFeePct?: number;
  camPoolOverride?: number;
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
      occPct: u.occPct ?? 1,
      flatRet: u.flatRet,
      camPoolOverride: u.camPoolOverride,
      camPrs: u.camPrs ?? prsFor(pool.propertyCode, "cam", u.name, u.sqft, buildingGla, cfg.cam.stipulatedPrs),
      insPrs: u.insPrs ?? prsFor(pool.propertyCode, "ins", u.name, u.sqft, buildingGla, cfg.ins.stipulatedPrs),
      retPrs: u.retPrs ?? prsFor(pool.propertyCode, "ret", u.name, u.sqft, buildingGla, cfg.ret.stipulatedPrs),
      adminFeePct: u.adminFeePct ?? cfg.cam.adminFeePct ?? 0,
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
