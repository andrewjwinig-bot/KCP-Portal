// Registry of retail reconciliation fixtures (the retail counterpart to the
// office registry). Each fixture exposes the building's expense pool and, per
// reconciliation year, the rent-roll roster (SF, escrow billed, RET discount).
// The route assembles tenant inputs by joining the roster to propertyRules PRS
// + the stored CAM config, then reconciles.

import type { RetailExpensePool } from "./types";
import type { RetailRosterUnit } from "./assemble";
import { POOL_2300, ROSTER_2300_2025 } from "./seed/2300";

export type RetailReconYear = { roster: RetailRosterUnit[] };

export type RetailReconFixture = {
  propertyCode: string;
  name: string;
  /** Full building GLA — the RET denominator fallback. */
  gla: number;
  pool: RetailExpensePool;
  byYear: Record<number, RetailReconYear>;
};

export const RETAIL_RECON_FIXTURES: Record<string, RetailReconFixture> = {
  "2300": {
    propertyCode: "2300",
    name: "Brookwood Shopping Center",
    gla: 61572,
    pool: POOL_2300,
    byYear: { 2025: { roster: ROSTER_2300_2025 } },
  },
};

export function availableRetailRecons(): { propertyCode: string; name: string; years: number[] }[] {
  return Object.values(RETAIL_RECON_FIXTURES).map((f) => ({
    propertyCode: f.propertyCode,
    name: f.name,
    years: Object.keys(f.byYear).map(Number).sort((a, b) => b - a),
  }));
}
