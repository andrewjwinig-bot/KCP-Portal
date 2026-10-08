// Building 40A0 reconciliation — assembled the CONNECTED way:
//   • Expense pool  ← SEED_EXPENSES["40A0"] (lib/rentroll/baseYearExpenses).
//   • Base years    ← match tenant-meta (40A0-A is NNN, 40A0-205 = 2023);
//     40A0-204's base year (2017) is from the workbook (no tenant-meta row).
// Only the thin CAMPRep layer (pro-rata %, gross-up, escrow) comes from the
// 40A0 workbook. NI LLC building → no Condo line. Small building: one anchor
// (Penn Emblem ~80%), two base-year tenants, and a vacated suite owed an
// escrow refund.
//
//   • 40A0-A (Penn Emblem) is a full-NNN anchor: no base-year stop, recovers
//     ~80.3% of the full pool (opex + RET). noBaseStop = true.
//   • 40A0-201 is vacant — modeled as gone for all of 2025 (occupancy 0) with
//     a $3,000 CAM escrow still to be refunded, so its only balance is the
//     -$3,000 credit (matches the workbook Building tab).

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

export const POOL_40A0: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["40A0"]);

export const LEASE_CONFIG_40A0_2025: Record<string, OfficeLeaseConfig> = {
  // Anchor — full NNN, ~80.3% of the full pool, no base-year stop.
  "40A0-A":   { baseYear: 0, noBaseStop: true, grossUp: true, proRataPct: 80.255917257839948, opexEscrow: 96000, retEscrow: 24000 },
  "40A0-204": { baseYear: 2017, grossUp: true, proRataPct: 12.351654180202877, opexEscrow: 5400, retEscrow: 360 },
  "40A0-205": { baseYear: 2023, grossUp: true, proRataPct: 4.2365577139826298, opexEscrow: 1200, retEscrow: 0 },
  // Vacated suite — escrow refund only (no recovery; occupancy 0 for 2025).
  "40A0-201": { baseYear: 2025, grossUp: false, proRataPct: 3.1558708479745408, opexEscrow: 3000, retEscrow: 0 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_40A0_2025: RosterUnit[] = [
  { unitRef: "40A0-A",   occupantName: "Penn Emblem Company",     sqft: 12105, isVacant: false, leaseFrom: "8/1/2018", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "40A0-204", occupantName: "TTS, LLC-Jillamy, Inc.",  sqft: 1863,  isVacant: false, leaseFrom: "8/1/2017", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "40A0-205", occupantName: "Adelina Express, LLC",    sqft: 639,   isVacant: false, leaseFrom: "9/1/2023", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  // Vacated before 2025 — occupancy 0, $3,000 escrow refund only.
  { unitRef: "40A0-201", occupantName: "Suite 201 (vacated — escrow refund)", sqft: 476, isVacant: false, leaseFrom: "1/1/2020", leaseTo: "12/31/2024", movedOut: "12/31/2024", opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_40A0_2025: Record<string, never> = {}; // none for 40A0

export const TENANTS_40A0_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_40A0_2025, 2025, LEASE_CONFIG_40A0_2025, RESETS_40A0_2025);
