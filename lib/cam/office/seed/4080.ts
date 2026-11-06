// Building 8 (4080) reconciliation — assembled the CONNECTED way:
//   • Expense pool  ← SEED_EXPENSES["4080"] (lib/rentroll/baseYearExpenses),
//     the same history shown on the Expense History page.
//   • Base years    ← match tenant-meta (lib/rentroll/baseYears), kept here
//     per recon-year so a future reset doesn't rewrite 2025.
// Only the thin CAMPRep layer (pro-rata %, gross-up, escrow) comes from the
// 4080 workbook's Tenant Inputs + Building tabs; the workbook validates, it
// is not the data source. NI LLC building → no Condo line.
//
// Notable cases:
//   • 4080-401 (Spectrum) is a full-NNN tenant: no base-year stop, recovers
//     12% of the full current-year expense (opex + RET). noBaseStop = true.
//   • 4080-109 / 209 are NOT grossed up; the rest gross up to 95%.
//   • 4080-221 (CIMPLIFI, base 2026) and the amenity/billboard lines are
//     declared exclusions in the registry (no 2025 occupancy).

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

// Pool comes straight from the app's expense history.
export const POOL_4080: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["4080"]);

export const LEASE_CONFIG_4080_2025: Record<string, OfficeLeaseConfig> = {
  "4080-100": { baseYear: 2023, grossUp: true,  proRataPct: 1.54,  opexEscrow: 960,    retEscrow: 0 },
  "4080-102": { baseYear: 2022, grossUp: true,  proRataPct: 2.96,  opexEscrow: 1200,   retEscrow: 0 },
  "4080-107": { baseYear: 2023, grossUp: true,  proRataPct: 1.17,  opexEscrow: 600,    retEscrow: 0 },
  "4080-109": { baseYear: 2024, grossUp: false, proRataPct: 1.60,  opexEscrow: 1800,   retEscrow: 0 },
  "4080-111": { baseYear: 2023, grossUp: true,  proRataPct: 1.20,  opexEscrow: 720,    retEscrow: 0 },
  "4080-117": { baseYear: 2023, grossUp: true,  proRataPct: 7.14,  opexEscrow: 4500,   retEscrow: 216 },
  "4080-207": { baseYear: 2025, grossUp: true,  proRataPct: 5.24,  opexEscrow: 0,      retEscrow: 0 },
  "4080-209": { baseYear: 2015, grossUp: false, proRataPct: 4.06,  opexEscrow: 5400,   retEscrow: 168 },
  "4080-210": { baseYear: 2024, grossUp: true,  proRataPct: 2.68,  opexEscrow: 3300,   retEscrow: 120 },
  "4080-215": { baseYear: 2014, grossUp: true,  proRataPct: 3.41,  opexEscrow: 8400,   retEscrow: 0 },
  "4080-217": { baseYear: 2022, grossUp: true,  proRataPct: 2.07,  opexEscrow: 4200,   retEscrow: 0 },
  "4080-219": { baseYear: 2024, grossUp: true,  proRataPct: 3.50,  opexEscrow: 4800,   retEscrow: 180 },
  "4080-305": { baseYear: 2023, grossUp: true,  proRataPct: 8.10,  opexEscrow: 0,      retEscrow: 0 },
  "4080-400": { baseYear: 2021, grossUp: true,  proRataPct: 3.66,  opexEscrow: 5400,   retEscrow: 0 },
  // Full-NNN: no base-year stop, recovers 12% of the full pool (opex + RET).
  "4080-401": { baseYear: 0, noBaseStop: true, grossUp: false, proRataPct: 12.0, opexEscrow: 123600, retEscrow: 0 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_4080_2025: RosterUnit[] = [
  { unitRef: "4080-100", occupantName: "Lawler Terrace Corp.",            sqft: 1865,  isVacant: false, leaseFrom: "4/1/2023",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-102", occupantName: "Reliant Care Solutions, LP",      sqft: 3600,  isVacant: false, leaseFrom: "9/15/2022", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-107", occupantName: "Lawler Terrace Corporation",      sqft: 1420,  isVacant: false, leaseFrom: "4/1/2023",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-109", occupantName: "Prosegur Services Group, Inc.",   sqft: 1915,  isVacant: false, leaseFrom: "11/1/2023", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-111", occupantName: "Jensen & Brusca Consulting",      sqft: 1462,  isVacant: false, leaseFrom: "4/1/2023",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-117", occupantName: "Worldwide Land Transfer, Inc.",   sqft: 8667,  isVacant: false, leaseFrom: "8/1/2015",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-207", occupantName: "MacKee, Inc.",                    sqft: 6361,  isVacant: false, leaseFrom: "11/1/2024", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-209", occupantName: "Data Systems Analysts, Inc.",     sqft: 4926,  isVacant: false, leaseFrom: "11/8/2004", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-210", occupantName: "Karpf, Karpf & Cerutti, P.C.",    sqft: 3257,  isVacant: false, leaseFrom: "6/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-215", occupantName: "Powers Kirn & Associates LLC",    sqft: 4143,  isVacant: false, leaseFrom: "9/1/2014",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-217", occupantName: "BEK Trans Group, Inc.",           sqft: 2516,  isVacant: false, leaseFrom: "8/1/2022",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-219", occupantName: "D&B/Guarino Engineers, LLC",      sqft: 4208,  isVacant: false, leaseFrom: "6/1/1997",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-305", occupantName: "Partnership for Community Supp",  sqft: 9822,  isVacant: false, leaseFrom: "8/1/2023",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-400", occupantName: "Korman Commercial Properties",    sqft: 4443,  isVacant: false, leaseFrom: "9/1/2021",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4080-401", occupantName: "Spectrum Control, Inc.",          sqft: 14574, isVacant: false, leaseFrom: "4/1/2021",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_4080_2025: Record<string, never> = {}; // none for 4080

export const TENANTS_4080_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_4080_2025, 2025, LEASE_CONFIG_4080_2025, RESETS_4080_2025);
