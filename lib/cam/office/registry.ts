// Registry of office reconciliation fixtures. Today this is the 4070
// workbook seed; as each building's "Expenses & Occ" import and December
// rent roll come online, the pool + roster will be sourced live and this
// registry becomes the fallback / fixture set the tie-out tests use.
//
// A fixture exposes, per reconciliation year, the rent-roll roster and the
// seed lease config — the route merges stored per-unit edits over the seed
// config, then assembles the tenant inputs from roster + merged config.

import type { OfficeExpensePool } from "./types";
import type { OfficeLeaseConfig, RosterUnit, ResetInfo } from "./assemble";
import { POOL_4070, LEASE_CONFIG_4070_2025, ROSTER_4070_2025, RESETS_4070_2025 } from "./seed/4070";
import { POOL_4050, LEASE_CONFIG_4050_2025, ROSTER_4050_2025, RESETS_4050_2025 } from "./seed/4050";
import { POOL_4060, LEASE_CONFIG_4060_2025, ROSTER_4060_2025, RESETS_4060_2025 } from "./seed/4060";
import { POOL_4080, LEASE_CONFIG_4080_2025, ROSTER_4080_2025, RESETS_4080_2025 } from "./seed/4080";
import { POOL_40A0, LEASE_CONFIG_40A0_2025, ROSTER_40A0_2025, RESETS_40A0_2025 } from "./seed/40A0";

export type OfficeReconYear = {
  roster: RosterUnit[];
  leaseConfig: Record<string, OfficeLeaseConfig>;
  /** Base-year resets seeded for this year (merged with stored resets). */
  resets: Record<string, ResetInfo>;
  /** Occupied roster units intentionally left out of the reconciliation
   *  (e.g. gross leases that don't reconcile), keyed by unit ref → reason.
   *  Lets the route distinguish a deliberate omission from a tenant
   *  accidentally missing a lease config (which is surfaced as a warning). */
  excludedUnits?: Record<string, string>;
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
      2025: { roster: ROSTER_4070_2025, leaseConfig: LEASE_CONFIG_4070_2025, resets: RESETS_4070_2025 },
    },
  },
  "4050": {
    propertyCode: "4050",
    name: "Building 5",
    pool: POOL_4050,
    byYear: {
      2025: {
        roster: ROSTER_4050_2025,
        leaseConfig: LEASE_CONFIG_4050_2025,
        resets: RESETS_4050_2025,
        // Fenningham (315) is a gross lease — it does not reconcile, so it's
        // intentionally absent from the lease config. Declared here so the
        // live rent roll doesn't flag it as a missing-config error.
        excludedUnits: { "4050-315": "Gross lease — does not reconcile" },
      },
    },
  },
  "4060": {
    propertyCode: "4060",
    name: "Building 6",
    pool: POOL_4060,
    byYear: {
      2025: {
        roster: ROSTER_4060_2025,
        leaseConfig: LEASE_CONFIG_4060_2025,
        resets: RESETS_4060_2025,
        // Tenants on the rent roll that intentionally don't reconcile:
        excludedUnits: {
          "4060-300": "J.J. White — gross lease",
          "4060-500": "Salem Financial — lease commences 1/1/2026 (no 2025 occupancy)",
          "4060-217": "Conference Center — amenity, no base year",
          "4060-208B": "BSG Provisions — former, no base year",
          "4060-117A": "Vein Clinics — former, no base year",
        },
      },
    },
  },
  "4080": {
    propertyCode: "4080",
    name: "Building 8",
    pool: POOL_4080,
    byYear: {
      2025: {
        roster: ROSTER_4080_2025,
        leaseConfig: LEASE_CONFIG_4080_2025,
        resets: RESETS_4080_2025,
        excludedUnits: {
          "4080-221": "CIMPLIFI — lease commences 2026 (no 2025 occupancy)",
          "4080-201": "Conference Center — amenity, no base year",
          "4080-GYM": "Gym fees — not a CAM tenant",
          "4080-RT1": "Outfront Media — rooftop/billboard, not a CAM tenant",
          "4080-112B": "DermaBeauty — former, settled separately (not on the Building tab)",
        },
      },
    },
  },
  "40A0": {
    propertyCode: "40A0",
    name: "Building 40A0",
    pool: POOL_40A0,
    byYear: {
      2025: { roster: ROSTER_40A0_2025, leaseConfig: LEASE_CONFIG_40A0_2025, resets: RESETS_40A0_2025 },
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
