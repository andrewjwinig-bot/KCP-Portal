// Building 3620 reconciliation — CONNECTED build (JV III, has Condo line):
//   • Expense pool ← SEED_EXPENSES["3620"] (includes Condo 6990, kept for JV III).
//   • Base years   ← match tenant-meta. Thin CAMPRep layer (share, gross-up,
//     escrow) from the workbook. All 11 tenants are full-year (no move-ins/outs).
//
// Notes:
//   • 3620-104 (Corporate Payroll) is NOT grossed up; the rest gross to 95%.
//   • 3620-205 (Mason East) has a NEGATIVE op-ex escrow (-$689) — a prior
//     overpayment reversal — so its balance is amountDue + $689.
//   • Delaware Valley Mgmt is unit 3620-307 in the rent roll / tenant-meta
//     (base 2021); the workbook labels it suite 310. Same tenant — using the
//     rent-roll ref so the unit page links correctly.

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

export const POOL_3620: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["3620"]);

export const LEASE_CONFIG_3620_2025: Record<string, OfficeLeaseConfig> = {
  "3620-100": { baseYear: 2020, grossUp: true,  proRataPct: 2.73,  opexEscrow: 624,   retEscrow: 240 },
  "3620-102": { baseYear: 2022, grossUp: true,  proRataPct: 2.57,  opexEscrow: 492,   retEscrow: 180 },
  "3620-104": { baseYear: 2011, grossUp: false, proRataPct: 5.20,  opexEscrow: 3360,  retEscrow: 0 },
  "3620-108": { baseYear: 2024, grossUp: true,  proRataPct: 2.10,  opexEscrow: 900,   retEscrow: 0 },
  "3620-110": { baseYear: 2017, grossUp: true,  proRataPct: 20.51, opexEscrow: 10800, retEscrow: 1800 },
  "3620-205": { baseYear: 2019, grossUp: true,  proRataPct: 1.83,  opexEscrow: -689,  retEscrow: 180 },
  "3620-208": { baseYear: 2021, grossUp: true,  proRataPct: 5.56,  opexEscrow: 1800,  retEscrow: 360 },
  "3620-209": { baseYear: 2024, grossUp: true,  proRataPct: 1.20,  opexEscrow: 504,   retEscrow: 0 },
  "3620-210": { baseYear: 2024, grossUp: true,  proRataPct: 1.00,  opexEscrow: 324,   retEscrow: 0 },
  "3620-307": { baseYear: 2021, grossUp: true,  proRataPct: 17.25, opexEscrow: 2160,  retEscrow: 0 },
  "3620-312": { baseYear: 2024, grossUp: true,  proRataPct: 2.25,  opexEscrow: 936,   retEscrow: 0 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_3620_2025: RosterUnit[] = [
  { unitRef: "3620-100", occupantName: "Vermont Information Processing", sqft: 1271, isVacant: false, leaseFrom: "7/1/2020",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-102", occupantName: "Home Solutions Realty Group LL", sqft: 1197, isVacant: false, leaseFrom: "6/1/2022",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-104", occupantName: "Corporate Payroll Services",     sqft: 2420, isVacant: false, leaseFrom: "11/1/2007", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-108", occupantName: "James D. Morrissey, Inc.",       sqft: 980,  isVacant: false, leaseFrom: "4/22/2024", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-110", occupantName: "ISD Renal, Inc.",                sqft: 9552, isVacant: false, leaseFrom: "8/22/2018", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-205", occupantName: "Mason East PA, Inc.",            sqft: 855,  isVacant: false, leaseFrom: "9/1/2001",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-208", occupantName: "J D Eckman, Inc.",               sqft: 2587, isVacant: false, leaseFrom: "3/8/2021",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-209", occupantName: "Freitag Family Insurance Agenc", sqft: 557,  isVacant: false, leaseFrom: "4/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-210", occupantName: "DJL Advisors, LLC",              sqft: 445,  isVacant: false, leaseFrom: "8/1/2021",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-307", occupantName: "Delaware Valley Mgmt. Holdings", sqft: 8034, isVacant: false, leaseFrom: "8/23/2021", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3620-312", occupantName: "Advenser LLC-PennHealth Inform", sqft: 1049, isVacant: false, leaseFrom: "1/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_3620_2025: Record<string, never> = {};

export const TENANTS_3620_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_3620_2025, 2025, LEASE_CONFIG_3620_2025, RESETS_3620_2025);
