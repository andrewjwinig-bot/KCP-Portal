// Building 3640 reconciliation — CONNECTED build (last JV III building):
//   • Expense pool ← SEED_EXPENSES["3640"] (includes Condo 6990, kept for JV III).
//   • Base years   ← match tenant-meta. Thin CAMPRep layer from the workbook.
//
// Base-year resets this year (point-in-time: the recon uses the OLD base
// prorated to the reset date; tenant-meta shows the current/new base year):
//   • 3640-101 (Land Medical) reset 10/1/2025 — base 2020 recovers through 9/30.
//   • 3640-111 (NALC) reset 7/1/2025 — base 2020 recovers through 6/30.
//   • 3640-105 (Gilson) & 204 (Epic) reset 1/1/2025 → 2025 base all year → $0
//     (no proration needed; the new base covers the whole year).
//
// Not grossed up: 105, 204 (both 2025-base → $0 anyway). Excluded (former /
// non-occupying, declared in the registry): 101B, 202A, 207E, and 207
// (University MRO — zero-day 2025 occupancy, $0).

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit, type ResetInfo } from "../assemble";

export const POOL_3640: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["3640"]);

export const LEASE_CONFIG_3640_2025: Record<string, OfficeLeaseConfig> = {
  "3640-101": { baseYear: 2020, grossUp: true,  proRataPct: 3.24,  opexEscrow: 0,    retEscrow: 0 },
  "3640-103": { baseYear: 2020, grossUp: true,  proRataPct: 3.52,  opexEscrow: 1440, retEscrow: 300 },
  "3640-105": { baseYear: 2025, grossUp: false, proRataPct: 2.50,  opexEscrow: 0,    retEscrow: 0 },
  "3640-106": { baseYear: 2022, grossUp: true,  proRataPct: 2.00,  opexEscrow: 180,  retEscrow: 180 },
  "3640-107": { baseYear: 2018, grossUp: true,  proRataPct: 7.21,  opexEscrow: 2400, retEscrow: 900 },
  "3640-108": { baseYear: 2021, grossUp: true,  proRataPct: 1.70,  opexEscrow: 360,  retEscrow: 180 },
  "3640-109": { baseYear: 2025, grossUp: true,  proRataPct: 2.78,  opexEscrow: 0,    retEscrow: 0 },
  "3640-111": { baseYear: 2020, grossUp: true,  proRataPct: 6.54,  opexEscrow: 1620, retEscrow: 300 },
  "3640-204": { baseYear: 2025, grossUp: false, proRataPct: 12.80, opexEscrow: 0,    retEscrow: 0 },
  "3640-205": { baseYear: 2022, grossUp: true,  proRataPct: 6.02,  opexEscrow: 600,  retEscrow: 360 },
  "3640-206": { baseYear: 2025, grossUp: true,  proRataPct: 2.23,  opexEscrow: 0,    retEscrow: 0 },
  "3640-300": { baseYear: 2021, grossUp: true,  proRataPct: 20.63, opexEscrow: 4800, retEscrow: 720 },
  "3640-301": { baseYear: 2019, grossUp: true,  proRataPct: 15.96, opexEscrow: 4140, retEscrow: 1800 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_3640_2025: RosterUnit[] = [
  { unitRef: "3640-101", occupantName: "Land Medical, Inc.",            sqft: 1505, isVacant: false, leaseFrom: "10/1/2020", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-103", occupantName: "Falcon Engineering Co., LLC",   sqft: 1630, isVacant: false, leaseFrom: "8/1/2016",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-105", occupantName: "Edward J. Gilson Jr.",          sqft: 1157, isVacant: false, leaseFrom: "11/1/2016", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-106", occupantName: "Signal of Eastern PA",          sqft: 922,  isVacant: false, leaseFrom: "10/19/2021", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-107", occupantName: "Envoy Lighting, Inc.",          sqft: 3340, isVacant: false, leaseFrom: "11/15/2018", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-108", occupantName: "Dennis Richman's Services",     sqft: 782,  isVacant: false, leaseFrom: "7/1/2021",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-109", occupantName: "Kleinfelder, Inc.",             sqft: 1288, isVacant: false, leaseFrom: "1/1/2025",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-111", occupantName: "NALC_AFL-CIO",                  sqft: 3192, isVacant: false, leaseFrom: "2/1/2020",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-204", occupantName: "Epic Health Services, Inc.",    sqft: 5934, isVacant: false, leaseFrom: "7/1/2016",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-205", occupantName: "Sisters of the Blessed Sacrame", sqft: 2790, isVacant: false, leaseFrom: "6/1/2022", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-206", occupantName: "Carnegie Healthcare Corporatio", sqft: 1035, isVacant: false, leaseFrom: "11/1/2024", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-300", occupantName: "Search Engines Marketer, Inc.", sqft: 9561, isVacant: false, leaseFrom: "3/1/2018",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3640-301", occupantName: "Solaray, LLC",                  sqft: 7400, isVacant: false, leaseFrom: "11/1/2019", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
];

// Mid-year base-year resets — old base prorated through the day before reset.
export const RESETS_3640_2025: Record<string, ResetInfo> = {
  "3640-101": { resetDate: "2025-10-01", originalBaseYear: 2020, newBaseYear: 2025 },
  "3640-111": { resetDate: "2025-07-01", originalBaseYear: 2020, newBaseYear: 2025 },
};

export const TENANTS_3640_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_3640_2025, 2025, LEASE_CONFIG_3640_2025, RESETS_3640_2025);
