// Building 6 (4060) reconciliation — assembled the CONNECTED way, like 4050:
//   • Expense pool  ← SEED_EXPENSES["4060"] (lib/rentroll/baseYearExpenses),
//     the same history shown on the Expense History page.
//   • Base years    ← match tenant-meta (lib/rentroll/baseYears), kept here
//     per recon-year so a future reset doesn't rewrite 2025.
// Only the thin CAMPRep layer (pro-rata %, gross-up, escrow, mid-year
// move-in/out) is building-specific, taken from the 4060 workbook's Tenant
// Inputs + Building tabs. The workbook is used only to validate, not as the
// data source. NI LLC building → no Condo line.

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

// Pool comes straight from the app's expense history.
export const POOL_4060: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["4060"]);

// Lease-level config (pro-rata + gross-up from CAMPRep, base years matching
// tenant-meta, escrow = collected during 2025 from the Building tab). All
// reconciling tenants gross up to 95%. Two point-in-time notes:
//   • 4060-208 has a 2026 base year — its base year hadn't started in 2025,
//     so it has no 2025 pro-rata share (0%) and recovers nothing. (The
//     workbook billed a full-pool recovery; that's the bug.)
//   • 4060-403's 2025 base year is 2024 (per the workbook). tenant-meta now
//     shows 2026 — its base year reset AFTER this reconciliation, which must
//     not rewrite the 2025 calc, so 2024 stays frozen here.
export const LEASE_CONFIG_4060_2025: Record<string, OfficeLeaseConfig> = {
  "4060-100": { baseYear: 2025, grossUp: true, proRataPct: 1.14,  opexEscrow: 0,     retEscrow: 0 },
  "4060-105": { baseYear: 2025, grossUp: true, proRataPct: 1.52,  opexEscrow: 0,     retEscrow: 0 },
  "4060-111": { baseYear: 2025, grossUp: true, proRataPct: 2.50,  opexEscrow: 0,     retEscrow: 0 },
  "4060-113": { baseYear: 2024, grossUp: true, proRataPct: 4.25,  opexEscrow: 1800,  retEscrow: 0 },
  "4060-204": { baseYear: 2025, grossUp: true, proRataPct: 0.93,  opexEscrow: 0,     retEscrow: 0 },
  "4060-205": { baseYear: 2023, grossUp: true, proRataPct: 1.06,  opexEscrow: 2100,  retEscrow: 0 },
  "4060-206": { baseYear: 2024, grossUp: true, proRataPct: 2.04,  opexEscrow: 900,   retEscrow: 0 },
  "4060-207": { baseYear: 2023, grossUp: true, proRataPct: 1.07,  opexEscrow: 300,   retEscrow: 0 },
  "4060-208": { baseYear: 2026, grossUp: true, proRataPct: 0,     opexEscrow: 0,     retEscrow: 0 },
  "4060-210": { baseYear: 2022, grossUp: true, proRataPct: 1.98,  opexEscrow: 2000,  retEscrow: 0 },
  "4060-211": { baseYear: 2022, grossUp: true, proRataPct: 1.47,  opexEscrow: 960,   retEscrow: 0 },
  "4060-212": { baseYear: 2024, grossUp: true, proRataPct: 2.52,  opexEscrow: 900,   retEscrow: 0 },
  "4060-215": { baseYear: 2020, grossUp: true, proRataPct: 1.78,  opexEscrow: 3300,  retEscrow: 0 },
  "4060-401": { baseYear: 2023, grossUp: true, proRataPct: 9.46,  opexEscrow: 0,     retEscrow: 0 },
  "4060-402": { baseYear: 2015, grossUp: true, proRataPct: 2.41,  opexEscrow: 285,   retEscrow: 0 },
  "4060-403": { baseYear: 2024, grossUp: true, proRataPct: 2.50,  opexEscrow: 0,     retEscrow: 0 },
  "4060-600": { baseYear: 2015, grossUp: true, proRataPct: 36.05, opexEscrow: 49500, retEscrow: 0 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_4060_2025: RosterUnit[] = [
  { unitRef: "4060-100", occupantName: "Audiology Distribution, LLC",     sqft: 1166,  isVacant: false, leaseFrom: "3/19/2025", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-105", occupantName: "NE Phila PA Caregiving LLC",      sqft: 1558,  isVacant: false, leaseFrom: "1/1/2025",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-111", occupantName: "CBIZ Operations, Inc.",          sqft: 2552,  isVacant: false, leaseFrom: "3/24/2025", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-113", occupantName: "MVC MSO, LLC",                   sqft: 4359,  isVacant: false, leaseFrom: "6/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-204", occupantName: "Kahak PA, Inc.",                 sqft: 957,   isVacant: false, leaseFrom: "1/1/2025",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-205", occupantName: "Presidential Bank, FSB",         sqft: 1091,  isVacant: false, leaseFrom: "2/1/2015",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-206", occupantName: "Law Offices of Sandra W Morris", sqft: 2095,  isVacant: false, leaseFrom: "10/1/2023", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-207", occupantName: "Legal Trucking LLC",             sqft: 1098,  isVacant: false, leaseFrom: "8/1/2023",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-208", occupantName: "MLS Tax, LLC",                   sqft: 872,   isVacant: false, leaseFrom: "11/1/2025", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-210", occupantName: "Zev Express, Inc.",             sqft: 2028,  isVacant: false, leaseFrom: "10/1/2021", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-211", occupantName: "Affinity Care of Pennsylvania",  sqft: 1505,  isVacant: false, leaseFrom: "11/1/2021", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-212", occupantName: "Helping Hand Nurse, LLC",        sqft: 2585,  isVacant: false, leaseFrom: "1/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-215", occupantName: "Regional Cardiology Consultant", sqft: 1828,  isVacant: false, leaseFrom: "12/1/2009", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-401", occupantName: "Senior Care Center Of America",  sqft: 9691,  isVacant: false, leaseFrom: "1/1/2012",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-402", occupantName: "Broder Bros. LLC",              sqft: 2475,  isVacant: false, leaseFrom: "6/1/2019",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-403", occupantName: "Modern Roofing & Exteriors LLC", sqft: 3639,  isVacant: false, leaseFrom: "1/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4060-600", occupantName: "Broder Bros.,Co.",              sqft: 36948, isVacant: false, leaseFrom: "11/1/2014", leaseTo: "11/30/2025", movedOut: "11/30/2025", opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_4060_2025: Record<string, never> = {}; // none for 4060

export const TENANTS_4060_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_4060_2025, 2025, LEASE_CONFIG_4060_2025, RESETS_4060_2025);
