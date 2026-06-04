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

// camPrs / insPrs / retPrs are percents; camPoolOverride only where the
// tenant's CAM pool differs from the full retail pool (pads).
export const ROSTER_7010_RETAIL_2025: RetailRosterUnit[] = [
  { unitRef: "7010-1230A", suite: "1230A", name: "Wawa, Inc.",              sqft: 6237, camPrs: 10.218560, insPrs: 0, retPrs: 8.518746, adminFeePct: 0, camPoolOverride: 311728.70, camEscrow: 31440, insEscrow: 0, retEscrow: 12468 },
  { unitRef: "7010-12315", suite: "12315", name: "Pat's Pizzaria",          sqft: 3200, camPrs: 5.242808, insPrs: 5.242808, retPrs: 4.370689, adminFeePct: 10, camEscrow: 22476, insEscrow: 516, retEscrow: 6396 },
  { unitRef: "7010-12319", suite: "12319", name: "Reen's Deli",             sqft: 4480, camPrs: 7.339931, insPrs: 7.339931, retPrs: 6.118965, adminFeePct: 10, camEscrow: 31452, insEscrow: 720, retEscrow: 8964 },
  { unitRef: "7010-12325", suite: "12325", name: "Parkwood Pack And Ship",  sqft: 1440, camPrs: 2.359263, insPrs: 2.359263, retPrs: 1.966810, adminFeePct: 10, camEscrow: 10128, insEscrow: 228, retEscrow: 2880 },
  { unitRef: "7010-12327", suite: "12327", name: "The Forge MMA",           sqft: 2048, occPct: 0.7452, camPrs: 2.797241, insPrs: 2.797241, retPrs: 2.797241, adminFeePct: 10, camEscrow: 3672, insEscrow: 0, retEscrow: 1890 },
  { unitRef: "7010-12329", suite: "12329", name: "Parkwood Super Valet",    sqft: 1600, camPrs: 2.621404, insPrs: 2.621404, retPrs: 2.185345, adminFeePct: 10, camEscrow: 11244, insEscrow: 252, retEscrow: 3204 },
  { unitRef: "7010-12331", suite: "12331", name: "Petroski Physiotherapy",  sqft: 2400, camPrs: 3.932106, insPrs: 5.942359, retPrs: 3.278017, adminFeePct: 10, camEscrow: 16860, insEscrow: 384, retEscrow: 4800 },
  { unitRef: "7010-12333", suite: "12333", name: "Hong Kong Chinese Restaurant", sqft: 1260, camPrs: 2.064355, insPrs: 2.064355, retPrs: 1.720959, adminFeePct: 10, camEscrow: 8832, insEscrow: 204, retEscrow: 2520 },
  { unitRef: "7010-12337", suite: "12337", name: "Parkwood Hairstylist",    sqft: 1920, camPrs: 3.145685, insPrs: 3.145685, retPrs: 2.622413, adminFeePct: 10, camEscrow: 13476, insEscrow: 312, retEscrow: 3840 },
  { unitRef: "7010-12339", suite: "12339", name: "Coldwell Banker",         sqft: 1480, camPrs: 2.424798, insPrs: 2.424798, retPrs: 2.021444, adminFeePct: 10, camEscrow: 10380, insEscrow: 240, retEscrow: 3120 },
  { unitRef: "7010-12341", suite: "12341", name: "Hair Wizards",            sqft: 1480, camPrs: 2.424798, insPrs: 3.664455, retPrs: 2.021444, adminFeePct: 10, camEscrow: 10380, insEscrow: 240, retEscrow: 2964 },
  { unitRef: "7010-12343", suite: "12343", name: "Philadelphia Flower",     sqft: 1440, camPrs: 2.359263, insPrs: 2.359263, retPrs: 1.966810, adminFeePct: 10, camEscrow: 10128, insEscrow: 228, retEscrow: 2880 },
  { unitRef: "7010-12345", suite: "12345", name: "Miss Beauty Salon",       sqft: 1440, camPrs: 2.359263, insPrs: 2.359263, retPrs: 1.966810, adminFeePct: 10, camEscrow: 10128, insEscrow: 228, retEscrow: 2880 },
  { unitRef: "7010-12349", suite: "12349", name: "North Inc",               sqft: 3845, occPct: 0.6712, camPrs: 6.299561, insPrs: 6.299561, retPrs: 5.251656, adminFeePct: 10, camEscrow: 14361.25, insEscrow: 0, retEscrow: 0 },
  { unitRef: "7010-12353", suite: "12353", name: "Zen Serenity",            sqft: 2167, camPrs: 3.550364, insPrs: 5.365455, retPrs: 2.959776, adminFeePct: 10, camEscrow: 15000, insEscrow: 360, retEscrow: 4332 },
  { unitRef: "7010-12357", suite: "12357", name: "We Rock the Spectrum",    sqft: 3312, camPrs: 5.426306, insPrs: 8.200456, retPrs: 4.523663, adminFeePct: 10, camEscrow: 23256, insEscrow: 528, retEscrow: 6600 },
  { unitRef: "7010-12360", suite: "12360", name: "Trumark Fin.",            sqft: 2280, camPrs: 2.976190, insPrs: 3.735500, retPrs: 3.114116, adminFeePct: 15, camPoolOverride: 373375.18, camEscrow: 15324, insEscrow: 360, retEscrow: 4560 },
  { unitRef: "7010-12363", suite: "12363", name: "Philly Soft Pretzel Factory", sqft: 1988, camPrs: 3.257094, insPrs: 3.257094, retPrs: 2.715291, adminFeePct: 10, camEscrow: 13944, insEscrow: 312, retEscrow: 3972 },
  { unitRef: "7010-12375", suite: "12375", name: "Dunkin Donuts",           sqft: 3200, camPrs: 5.242808, insPrs: 0, retPrs: 4.370689, adminFeePct: 10, camPoolOverride: 373375.18, camEscrow: 20592, insEscrow: 0, retEscrow: 6396 },
  // Senator Sabatina — gross lease (grossLease in the config seed).
  { unitRef: "7010-12361", suite: "12361", name: "Senator John P. Sabatina's Office", sqft: 1456, camPrs: 0, insPrs: 0, retPrs: 0, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
];

export const TENANTS_7010_RETAIL_2025 = assembleRetail(POOL_7010_RETAIL, ROSTER_7010_RETAIL_2025, 61036);
