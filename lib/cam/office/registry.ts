// Registry of office reconciliation fixtures. Today this is the 4070
// workbook seed; as each building's "Expenses & Occ" import and December
// rent roll come online, the pool + roster will be sourced live and this
// registry becomes the fallback / fixture set the tie-out tests use.
//
// A fixture exposes, per reconciliation year, the rent-roll roster and the
// seed lease config — the route merges stored per-unit edits over the seed
// config, then assembles the tenant inputs from roster + merged config.

import type { OfficeExpensePool } from "./types";
import type { OfficeLeaseConfig, RosterUnit } from "./assemble";
import { POOL_4070, LEASE_CONFIG_4070_2025, ROSTER_4070_2025 } from "./seed/4070";

export type OfficeReconYear = {
  roster: RosterUnit[];
  leaseConfig: Record<string, OfficeLeaseConfig>;
};

export type OfficeReconFixture = {
  propertyCode: string;
  name: string;
  pool: OfficeExpensePool;
  byYear: Record<number, OfficeReconYear>;
};

export const OFFICE_RECON_FIXTURES: Record<string, OfficeReconFixture> = {
  "4070": {
    propertyCode: "4070",
    name: "Building 7",
    pool: POOL_4070,
    byYear: {
      2025: { roster: ROSTER_4070_2025, leaseConfig: LEASE_CONFIG_4070_2025 },
    },
  },
};

export function availableOfficeRecons(): { propertyCode: string; name: string; years: number[] }[] {
  return Object.values(OFFICE_RECON_FIXTURES).map((f) => ({
    propertyCode: f.propertyCode,
    name: f.name,
    years: Object.keys(f.byYear).map(Number).sort((a, b) => b - a),
  }));
}
