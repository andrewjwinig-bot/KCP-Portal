// Building 40C0 (Kor Center C) reconciliation — CONNECTED build:
//   • Expense pool ← SEED_EXPENSES["40C0"].
//   • Base year    ← tenant-meta (40C0-CP is NNN).
// Single-tenant building: one full-NNN occupant taking 100% of the pool, not
// grossed up. Only the thin CAMPRep layer (escrow) comes from the workbook.
// The Building tab names the tenant "Polymershapes LLC"; the Tenant Inputs tab
// (older) still showed "American Bread Company LLC" — using the Building name.

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { SEED_EXPENSES } from "../../../rentroll/baseYearExpenses";
import { poolFromSeedExpenses } from "../poolFromSeed";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit } from "../assemble";

export const POOL_40C0: OfficeExpensePool = poolFromSeedExpenses(SEED_EXPENSES["40C0"]);

export const LEASE_CONFIG_40C0_2025: Record<string, OfficeLeaseConfig> = {
  // Full-NNN single tenant — 100% of the pool, no base-year stop, not grossed up.
  "40C0-CP": { baseYear: 0, noBaseStop: true, grossUp: false, proRataPct: 100, opexEscrow: 45650, retEscrow: 31490 },
};

const FULL_TO = "12/31/2030";
export const ROSTER_40C0_2025: RosterUnit[] = [
  { unitRef: "40C0-CP", occupantName: "Polymershapes LLC", sqft: 18000, isVacant: false, leaseFrom: "3/8/1999", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
];

export const RESETS_40C0_2025: Record<string, never> = {};

export const TENANTS_40C0_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_40C0_2025, 2025, LEASE_CONFIG_40C0_2025, RESETS_40C0_2025);
