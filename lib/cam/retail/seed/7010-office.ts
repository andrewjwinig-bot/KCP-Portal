// Parkwood Shopping/Office Center (7010) — OFFICE portion (8503 accounts + the
// 14% Maintenance Salaries allocation). The expense POOL is derived from the
// single allocation source (lib/cam/retail/allocation.ts → MIXED_7010); this
// file holds only the office roster + assembly. Pro-rata over the office GLA
// (12,179 sf). Parkwood Medical (203) is the only active payer (no admin);
// Foot & Ankle (201) and Storage (218) are gross; the rest are vacant.

import { assembleRetail, type RetailRosterUnit } from "../assemble";
import { POOL_7010_OFFICE } from "../allocation";

export { POOL_7010_OFFICE };

const OFFICE_GLA = 12179;

// PRS + admin live in the CAM config seed (lib/cam/retailConfigSeed.ts); the
// roster carries only rent-roll facts. 201 / 218 are gross (config seed).
export const ROSTER_7010_OFFICE_2025: RetailRosterUnit[] = [
  { unitRef: "7010-201", suite: "201", name: "Foot and Ankle Center of Phila", sqft: 2471, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
  { unitRef: "7010-203", suite: "203", name: "Parkwood Medical", sqft: 2157, camEscrow: 18156, insEscrow: 180, retEscrow: 4308 },
  { unitRef: "7010-218", suite: "218", name: "Parkwood Medical (storage)", sqft: 557, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
];

export const TENANTS_7010_OFFICE_2025 = assembleRetail(POOL_7010_OFFICE, ROSTER_7010_OFFICE_2025, OFFICE_GLA);
