// Building 40B0 (Kor Center B) reconciliation — CONNECTED build:
//   • Expense pool ← SEED_EXPENSES["40B0"].
//   • Base years   ← tenant-meta (40B0-1 NNN, 40B0-3 = 2024, 40B0-4 = 2025).
// Unit refs follow the rent roll / tenant-meta (40B0-1/-3/-4); the workbook
// labels the middle suite "2", but it's the same base-2024 tenant (Mercer
// Bucks) the rent roll calls 40B0-3. Only the thin CAMPRep layer (share,
// gross-up, escrow) comes from the workbook. NI LLC → no Condo line.
//   • 40B0-1 (Just Children) is a full-NNN anchor (~73.4% of the pool).
//   • 40B0-4 (US Connect) moved in 9/1/2025 with a 2025 base year → nets $0.
//
// Note: SEED_40B0's 2024 grossed-up Mgmt Fee / Cleaning are inflated (2024
// occupancy is recorded at 11%), but per-line flooring zeroes those lines, so
// the base-2024 tenant's recovery comes from the lines that genuinely rose —
// matching the workbook ($199.55). The 2024 occupancy figure is worth a look
// on the Expense History side, but it doesn't affect this reconciliation.

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

export const POOL_40B0: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["40B0"]);

export const LEASE_CONFIG_40B0_2025: Record<string, OfficeLeaseConfig> = {
  // Anchor — full NNN, ~73.4% of the full pool, no base-year stop.
  "40B0-1": { baseYear: 0, noBaseStop: true, grossUp: true, proRataPct: 73.362613653875786, opexEscrow: 46800, retEscrow: 18000 },
  "40B0-3": { baseYear: 2024, grossUp: true, proRataPct: 8.1907844043766373, opexEscrow: 1200, retEscrow: 0 },
  "40B0-4": { baseYear: 2025, grossUp: true, proRataPct: 18.446601941747573, opexEscrow: 0, retEscrow: 0 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_40B0_2025: RosterUnit[] = [
  { unitRef: "40B0-1", occupantName: "Just Children Neshaminy Int.", sqft: 9521, isVacant: false, leaseFrom: "10/1/1992", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "40B0-3", occupantName: "Mercer Bucks Technology, LLC", sqft: 1063, isVacant: false, leaseFrom: "1/1/2024",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "40B0-4", occupantName: "US Connect, LLC",              sqft: 2394, isVacant: false, leaseFrom: "9/1/2025",  leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_40B0_2025: Record<string, never> = {};

export const TENANTS_40B0_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_40B0_2025, 2025, LEASE_CONFIG_40B0_2025, RESETS_40B0_2025);
