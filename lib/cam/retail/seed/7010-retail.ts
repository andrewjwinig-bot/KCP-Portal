// Parkwood Shopping/Office Center (7010) — RETAIL portion (8502 accounts).
// 7010 is a mixed retail + office center. The expense POOL is derived from the
// single allocation source (lib/cam/retail/allocation.ts → MIXED_7010), so
// adding/changing an expense there updates retail, office, and the breakdown
// together. This file holds only the retail rent-roll roster + assembly.
//
// Retail is bespoke per tenant (pads on reduced pools, varying CAM / INS
// denominators, partial occupancy, mixed admin), so each tenant carries
// explicit figures from the workbook rather than a single shared denominator.

import { assembleRetail, type RetailRosterUnit } from "../assemble";
import { POOL_7010_RETAIL } from "../allocation";

export { POOL_7010_RETAIL };

// PRS + admin + line exclusions all live in the CAM config seed
// (lib/cam/retailConfigSeed.ts) so the unit page and reconciliation share one
// source. The pad tenants' reduced CAM pools (Wawa, Trumark, Dunkin) are
// modeled as real expense-line exclusions in the config — NOT pool overrides —
// so the excluded lines show struck-through on the statement + checked on the
// unit page. The roster carries only rent-roll facts (SF, escrow, occupancy).
export const ROSTER_7010_RETAIL_2025: RetailRosterUnit[] = [
  { unitRef: "7010-1230A", suite: "1230A", name: "Wawa, Inc.",              sqft: 6237, camEscrow: 31440, insEscrow: 0, retEscrow: 12468 },
  { unitRef: "7010-12315", suite: "12315", name: "Pat's Pizzaria",          sqft: 3200, camEscrow: 22476, insEscrow: 516, retEscrow: 6396 },
  { unitRef: "7010-12319", suite: "12319", name: "Reen's Deli",             sqft: 4480, camEscrow: 31452, insEscrow: 720, retEscrow: 8964 },
  { unitRef: "7010-12325", suite: "12325", name: "Parkwood Pack And Ship",  sqft: 1440, camEscrow: 10128, insEscrow: 228, retEscrow: 2880 },
  { unitRef: "7010-12327", suite: "12327", name: "The Forge MMA",           sqft: 2048, occPct: 0.7452, camEscrow: 3672, insEscrow: 0, retEscrow: 1890 },
  { unitRef: "7010-12329", suite: "12329", name: "Parkwood Super Valet",    sqft: 1600, camEscrow: 11244, insEscrow: 252, retEscrow: 3204 },
  { unitRef: "7010-12331", suite: "12331", name: "Petroski Physiotherapy",  sqft: 2400, camEscrow: 16860, insEscrow: 384, retEscrow: 4800 },
  { unitRef: "7010-12333", suite: "12333", name: "Hong Kong Chinese Restaurant", sqft: 1260, camEscrow: 8832, insEscrow: 204, retEscrow: 2520 },
  { unitRef: "7010-12337", suite: "12337", name: "Parkwood Hairstylist",    sqft: 1920, camEscrow: 13476, insEscrow: 312, retEscrow: 3840 },
  { unitRef: "7010-12339", suite: "12339", name: "Coldwell Banker",         sqft: 1480, camEscrow: 10380, insEscrow: 240, retEscrow: 3120 },
  { unitRef: "7010-12341", suite: "12341", name: "Hair Wizards",            sqft: 1480, camEscrow: 10380, insEscrow: 240, retEscrow: 2964 },
  { unitRef: "7010-12343", suite: "12343", name: "Philadelphia Flower",     sqft: 1440, camEscrow: 10128, insEscrow: 228, retEscrow: 2880 },
  { unitRef: "7010-12345", suite: "12345", name: "Miss Beauty Salon",       sqft: 1440, camEscrow: 10128, insEscrow: 228, retEscrow: 2880 },
  { unitRef: "7010-12349", suite: "12349", name: "North Inc",               sqft: 3845, occPct: 0.6712, camEscrow: 14361.25, insEscrow: 0, retEscrow: 0 },
  { unitRef: "7010-12353", suite: "12353", name: "Zen Serenity",            sqft: 2167, camEscrow: 15000, insEscrow: 360, retEscrow: 4332 },
  { unitRef: "7010-12357", suite: "12357", name: "We Rock the Spectrum",    sqft: 3312, camEscrow: 23256, insEscrow: 528, retEscrow: 6600 },
  { unitRef: "7010-12360", suite: "12360", name: "Trumark Fin.",            sqft: 2280, camEscrow: 15324, insEscrow: 360, retEscrow: 4560 },
  { unitRef: "7010-12363", suite: "12363", name: "Philly Soft Pretzel Factory", sqft: 1988, camEscrow: 13944, insEscrow: 312, retEscrow: 3972 },
  { unitRef: "7010-12375", suite: "12375", name: "Dunkin Donuts",           sqft: 3200, camEscrow: 20592, insEscrow: 0, retEscrow: 6396 },
  // Senator Sabatina — gross lease (grossLease in the config seed).
  { unitRef: "7010-12361", suite: "12361", name: "Senator John P. Sabatina's Office", sqft: 1456, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
];

export const TENANTS_7010_RETAIL_2025 = assembleRetail(POOL_7010_RETAIL, ROSTER_7010_RETAIL_2025, 61036);
