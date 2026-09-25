// Shops of Lafayette Hill (9510) retail reconciliation — connected build.
//   • PRS is LEASE-STIPULATED per tenant (not SF-derived) — seeded in the
//     CAMPRep config seed (lib/cam/retailConfigSeed.ts). 10% CAM admin fee,
//     except Wawa (0%).
//   • NO separate INS pool: insurance is the "Liability Insurance" CAM line, so
//     insAmount = 0 and this center reconciles CAM (insurance included) + RET.
//   • Wawa (406) excludes the "Parking Lot Cap Ex" amortization and is billed
//     QUARTERLY — its quarterly payments are NOT escrow, so escrow stays $0 and
//     the recon shows the full-year amount (the quarterly billings are tracked
//     separately on the task tracker; to be linked later). Wawa's share is its
//     21% lease share (matching the quarterly bill), not the 20% SF share.
//   Pools + escrow billed ← the 2025 "Lafayette Hill CAM Billings" workbook
//   ("9510 LH" master + per-tenant sheets). Line labels match CAM_LINE_ITEMS
//   where a tenant excludes them so the exclusion lookup resolves.

import type { RetailExpensePool } from "../types";
import { assembleRetail, type RetailRosterUnit } from "../assemble";

const GLA_9510 = 19983; // total leasable SF (PRS is lease-stipulated, so this is only a fallback).

export const POOL_9510: RetailExpensePool = {
  propertyCode: "9510",
  reconYear: 2025,
  camLines: [
    { glAccount: "—", label: "Parking Lot Cap Ex", amount: 35571, nonControllable: true }, // amortized cap-ex; Wawa excludes it
    { glAccount: "6030-8502", label: "Maintenance Salaries", amount: 7680 },
    { glAccount: "6120-8502", label: "Electric (Common)", amount: 2466.37, nonControllable: true },
    { glAccount: "6130-8502", label: "Water / Sewer", amount: 0, nonControllable: true },
    { glAccount: "6220-8502", label: "Building Maintenance", amount: 17881.14 },
    { glAccount: "6330-8502", label: "Parking Lot Cleaning", amount: 18210 },
    { glAccount: "6350-8502", label: "Security", amount: 895 },
    { glAccount: "6360-8502", label: "Parking Lot Maintenance", amount: 9526.80 },
    { glAccount: "6370-8502", label: "Snow Removal", amount: 7789.66, nonControllable: true },
    { glAccount: "6270-8502", label: "Trash Removal", amount: 27799.40 },
    { glAccount: "6380-8502", label: "Landscaping", amount: 3384.81 },
    { glAccount: "6510-8502", label: "Liability Insurance", amount: 42576.35, nonControllable: true },
  ],
  insAmount: 0,          // No separate INS pool — insurance is the Liability Insurance CAM line.
  retAmount: 32912.45,   // Real Estate Taxes
};

// Escrow billed during 2025. Vacant suites (400/404/416/428) and suite 500
// (no CAM/RET) are omitted. Wawa is billed quarterly → $0 here.
export const ROSTER_9510_2025: RetailRosterUnit[] = [
  { unitRef: "9510-406", suite: "406", name: "Wawa",                    sqft: 3600, camEscrow: 0,        insEscrow: 0, retEscrow: 0 },
  { unitRef: "9510-408", suite: "408", name: "Vino's Pizza",            sqft: 1035, camEscrow: 11400,    insEscrow: 0, retEscrow: 1632 },
  { unitRef: "9510-410", suite: "410", name: "Hunan Wok",               sqft: 947,  camEscrow: 11400,    insEscrow: 0, retEscrow: 1608 },
  { unitRef: "9510-412", suite: "412", name: "Touch of Class",          sqft: 1174, camEscrow: 11700,    insEscrow: 0, retEscrow: 1860 },
  { unitRef: "9510-414", suite: "414", name: "Hair Concepts",           sqft: 995,  camEscrow: 10030.84, insEscrow: 0, retEscrow: 1441 },
  { unitRef: "9510-420", suite: "420", name: "Lafayette Hill Cleaners", sqft: 1683, camEscrow: 18000,    insEscrow: 0, retEscrow: 2652 },
  { unitRef: "9510-422", suite: "422", name: "Liang Jiang",             sqft: 837,  camEscrow: 8400,     insEscrow: 0, retEscrow: 1320 },
  { unitRef: "9510-424", suite: "424", name: "DKMNK",                   sqft: 837,  camEscrow: 8400,     insEscrow: 0, retEscrow: 1320 },
  { unitRef: "9510-426", suite: "426", name: "Marvel Agency",           sqft: 837,  camEscrow: 7800,     insEscrow: 0, retEscrow: 1404 },
];

export const TENANTS_9510_2025 = assembleRetail(POOL_9510, ROSTER_9510_2025, GLA_9510);
