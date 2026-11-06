// Building 5 (4050) reconciliation — assembled by CONNECTING the data the
// app already holds, not by re-keying the workbook:
//   • Expense pool  ← SEED_EXPENSES["4050"] (lib/rentroll/baseYearExpenses),
//     the same history shown on the Expense History page.
//   • Base years    ← match tenant-meta (lib/rentroll/baseYears); kept here
//     per recon-year so a future reset doesn't rewrite 2025.
// Only the thin CAMPRep layer (pro-rata %, gross-up, escrow, and the two
// mid-year move-outs) is building-specific. The 2025 workbook is used only
// to validate, not as the data source. NI LLC building → no Condo line.

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

// Pool comes straight from the app's expense history.
export const POOL_4050: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["4050"]);

// Lease-level config (pro-rata + gross-up from CAMPRep, base years matching
// tenant-meta, escrow = collected during 2025). Fenningham (315) is a gross
// lease — no entry → excluded from the reconciliation.
export const LEASE_CONFIG_4050_2025: Record<string, OfficeLeaseConfig> = {
  "4050-113":  { baseYear: 2016, grossUp: true, proRataPct: 3.12,  opexEscrow: 3000,  retEscrow: 0 },
  "4050-115":  { baseYear: 2021, grossUp: true, proRataPct: 1.32,  opexEscrow: 1320,  retEscrow: 108 },
  "4050-201":  { baseYear: 2022, grossUp: true, proRataPct: 2.19,  opexEscrow: 1440,  retEscrow: 180 },
  "4050-205":  { baseYear: 2023, grossUp: true, proRataPct: 19.58, opexEscrow: 15000, retEscrow: 0 },
  "4050-206":  { baseYear: 2020, grossUp: true, proRataPct: 3.77,  opexEscrow: 4128,  retEscrow: 264 },
  "4050-207":  { baseYear: 2022, grossUp: true, proRataPct: 7.34,  opexEscrow: 6000,  retEscrow: 540 },
  "4050-300":  { baseYear: 2024, grossUp: true, proRataPct: 1.45,  opexEscrow: 420,   retEscrow: 0 },
  "4050-301":  { baseYear: 2024, grossUp: true, proRataPct: 3.77,  opexEscrow: 1500,  retEscrow: 120 },
  "4050-307":  { baseYear: 2024, grossUp: true, proRataPct: 0.9,   opexEscrow: 0,     retEscrow: 0 },
  "4050-215":  { baseYear: 2022, grossUp: true, proRataPct: 3.1608769720761425, opexEscrow: 0, retEscrow: 0 },
  "4050-119B": { baseYear: 2022, grossUp: true, proRataPct: 3.61,  opexEscrow: 800,   retEscrow: 90 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_4050_2025: RosterUnit[] = [
  { unitRef: "4050-113",  occupantName: "American Bread Company LLC",     sqft: 1601,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-115",  occupantName: "SKH Abstract Agency Inc.",       sqft: 679,   isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-201",  occupantName: "ABC Home Medical Supply, Inc.",  sqft: 1123,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-205",  occupantName: "Office Works Partnership",       sqft: 10048, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-206",  occupantName: "Khavinson & Associates, P.C.",   sqft: 1933,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-207",  occupantName: "Pragmatics, Inc.",               sqft: 3767,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-215",  occupantName: "Relentless Marketing Solutions", sqft: 1707,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: "2/28/2025", movedOut: "2/28/2025", opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4050-300",  occupantName: "First Choice Lending Of NJ",     sqft: 826,   isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-301",  occupantName: "Disaster Solutions, Inc.",       sqft: 1934,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-307",  occupantName: "Larry H. Lefkowitz, Esquire",    sqft: 452,   isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0,    reTaxMonth: 0 },
  { unitRef: "4050-119B", occupantName: "Open Systems Healthcare, Inc.",  sqft: 1850,  isVacant: false, leaseFrom: "1/1/2000", leaseTo: "4/30/2025", movedOut: "4/30/2025", opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_4050_2025: Record<string, never> = {}; // none for 4050

export const TENANTS_4050_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_4050_2025, 2025, LEASE_CONFIG_4050_2025);
