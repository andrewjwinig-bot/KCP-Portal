// Building 3610 reconciliation — CONNECTED build (first JV III building):
//   • Expense pool ← SEED_EXPENSES["3610"] — INCLUDES the Condo (6990) line,
//     which the route keeps for JV III (3610/3620/3640) and hides elsewhere.
//   • Base years   ← match tenant-meta. Only the thin CAMPRep layer (share,
//     gross-up, escrow, the two mid-year move-ins and the Traffic Tech
//     downsize) comes from the workbook.
//
// Notable cases:
//   • 3610-300 (EELP) is NOT grossed up; the rest gross up to 95%.
//   • 3610-202 / 203 moved in mid-2025 with a 2025 base year → recover $0.
//   • 3610-302 (Traffic Tech) downsized 8/1/2025: it leased 2,394 rsf (6.02%,
//     base 2016) Jan–Jul, then moved into 1-301 on a fresh 2025 base. Only the
//     old base-2016 space is recoverable, prorated through 7/31; the new 2025
//     piece nets $0, so it isn't modeled separately. tenant-meta shows 302's
//     CURRENT base year (2025, post-downsize); the 2025 recon uses the 2016
//     base that applied to the old space (point-in-time).

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

export const POOL_3610: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["3610"]);

export const LEASE_CONFIG_3610_2025: Record<string, OfficeLeaseConfig> = {
  "3610-101": { baseYear: 2016, grossUp: true,  proRataPct: 3.01, opexEscrow: 960,  retEscrow: 240 },
  "3610-103": { baseYear: 2025, grossUp: true,  proRataPct: 5.88, opexEscrow: 0,    retEscrow: 0 },
  "3610-104": { baseYear: 2020, grossUp: true,  proRataPct: 6.34, opexEscrow: 3120, retEscrow: 144 },
  "3610-105": { baseYear: 2024, grossUp: true,  proRataPct: 2.87, opexEscrow: 540,  retEscrow: 0 },
  "3610-106": { baseYear: 2016, grossUp: true,  proRataPct: 2.52, opexEscrow: 960,  retEscrow: 240 },
  "3610-202": { baseYear: 2025, grossUp: true,  proRataPct: 2.75, opexEscrow: 0,    retEscrow: 0 },
  "3610-203": { baseYear: 2025, grossUp: true,  proRataPct: 3.29, opexEscrow: 0,    retEscrow: 0 },
  "3610-205": { baseYear: 2024, grossUp: true,  proRataPct: 1.54, opexEscrow: 96,   retEscrow: 0 },
  "3610-209": { baseYear: 2022, grossUp: true,  proRataPct: 1.51, opexEscrow: 240,  retEscrow: 0 },
  "3610-300": { baseYear: 2017, grossUp: false, proRataPct: 7.44, opexEscrow: 2400, retEscrow: 600 },
  "3610-302": { baseYear: 2016, grossUp: true,  proRataPct: 6.02, opexEscrow: 1225, retEscrow: 350 },
  "3610-305": { baseYear: 2016, grossUp: true,  proRataPct: 2.90, opexEscrow: 960,  retEscrow: 240 },
  "3610-310": { baseYear: 2019, grossUp: true,  proRataPct: 5.66, opexEscrow: 4200, retEscrow: 600 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_3610_2025: RosterUnit[] = [
  { unitRef: "3610-101", occupantName: "Altruistic Home Care Agency",   sqft: 1197, isVacant: false, leaseFrom: "3/1/2016",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-103", occupantName: "Paragon Exterior LLC",          sqft: 2338, isVacant: false, leaseFrom: "1/1/2025",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-104", occupantName: "All American Hospice, LLC",     sqft: 2522, isVacant: false, leaseFrom: "2/1/2020",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-105", occupantName: "Julia Meehan-Haley Eicher LLC", sqft: 1140, isVacant: false, leaseFrom: "10/1/2024", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-106", occupantName: "Patient Bliss Home Care Agency", sqft: 1002, isVacant: false, leaseFrom: "8/15/2016", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-202", occupantName: "Leonard A. Feinberg, Inc.",     sqft: 1094, isVacant: false, leaseFrom: "2/15/2025", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-203", occupantName: "Apollo Acquisitions, Inc.",     sqft: 1311, isVacant: false, leaseFrom: "7/1/2025",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-205", occupantName: "Lincoln Medical Supplies, LLC", sqft: 612,  isVacant: false, leaseFrom: "5/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-209", occupantName: "West Comm, Inc.",               sqft: 600,  isVacant: false, leaseFrom: "5/1/2022",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-300", occupantName: "EELP, Inc.",                    sqft: 2960, isVacant: false, leaseFrom: "5/1/2017",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  // Traffic Tech downsized 8/1/2025 — old 6.02% / base-2016 space recovers through 7/31.
  { unitRef: "3610-302", occupantName: "Traffic Tech, Inc.",            sqft: 2394, isVacant: false, leaseFrom: "7/1/2016",  leaseTo: "7/31/2025", movedOut: "7/31/2025", opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-305", occupantName: "Horizon House, Inc.",           sqft: 1145, isVacant: false, leaseFrom: "5/16/2016", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "3610-310", occupantName: "AmRes Corporation",             sqft: 2251, isVacant: false, leaseFrom: "9/20/2017", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_3610_2025: Record<string, never> = {};

export const TENANTS_3610_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_3610_2025, 2025, LEASE_CONFIG_3610_2025, RESETS_3610_2025);
