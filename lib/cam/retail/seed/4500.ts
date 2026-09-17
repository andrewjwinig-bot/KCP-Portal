// Gray's Ferry Shopping Center (4500) retail reconciliation — connected build.
//   • PRS per category ← propertyRules.ts (CAM 82,809 / INS 79,134 excl. the
//     McDonald's outparcel / RET 82,809, with Victra's RET on the reduced
//     79,134 GLA). Admin fees + line exclusions + PLCB gross lease ← the
//     CAMPRep config seed. Pools + escrow + occupancy + Clear Channel's flat
//     RET ← the 2025 CAM workbook.
//   Quirks: McDonald's pad (no INS, excl. Building Maintenance, 15% admin);
//   Fresh Grocer anchor (5% admin, excl. Building Maintenance, admin-excl.
//   Liability/Security/utilities); Victra partial year (69.3%); USPS RET-only;
//   Clear Channel billboard (gross CAM/INS, pays 100% of its own parcel RET
//   $3,017); PLCB gross.

import type { RetailExpensePool } from "../types";
import { assembleRetail, type RetailRosterUnit } from "../assemble";

const GLA_4500 = 82809;

export const POOL_4500: RetailExpensePool = {
  propertyCode: "4500",
  reconYear: 2025,
  camLines: [
    { glAccount: "6030-8502", label: "Maintenance Salaries", amount: 31440 },
    { glAccount: "6120-8502", label: "Electric (Common)", amount: 8532.48, nonControllable: true },
    { glAccount: "6130-8502", label: "Water / Sewer", amount: 1010.84, nonControllable: true },
    { glAccount: "6220-8502", label: "Building Maintenance", amount: 21141.73 },
    { glAccount: "6330-8502", label: "Parking Lot Cleaning", amount: 50810 },
    { glAccount: "6350-8502", label: "Security", amount: 100080.83 },
    { glAccount: "6360-8502", label: "Parking Lot Maintenance", amount: 64512.80 },
    { glAccount: "6370-8502", label: "Snow Removal", amount: 51290, nonControllable: true },
    { glAccount: "6270-8502", label: "Trash Removal", amount: 13548.44 },
    { glAccount: "6380-8502", label: "Landscaping", amount: 20796.15 },
    { glAccount: "—", label: "Liability Insurance", amount: 68587.04, nonControllable: true },
  ],
  insAmount: 11645.40,   // Property Insurance
  retAmount: 159405.02,  // Real Estate Taxes (recoverable, after adjustment)
};

export const ROSTER_4500_2025: RetailRosterUnit[] = [
  { unitRef: "4500-2851", suite: "2851", name: "McDonald's",     sqft: 3675,  camEscrow: 26568, insEscrow: 0,    retEscrow: 0 },
  { unitRef: "4500-2891", suite: "2891", name: "JP Morgan",      sqft: 2486,  camEscrow: 18996, insEscrow: 348,  retEscrow: 4824 },
  { unitRef: "4500-2895", suite: "2895", name: "Nail Parlor",    sqft: 1600,  camEscrow: 12228, insEscrow: 228,  retEscrow: 3108 },
  { unitRef: "4500-2897", suite: "2897", name: "Victra, Inc.",   sqft: 1600,  occPct: 0.6932, camEscrow: 2000, insEscrow: 160, retEscrow: 2056 },
  { unitRef: "4500-2899", suite: "2899", name: "Curl & Care",    sqft: 1600,  camEscrow: 12228, insEscrow: 228,  retEscrow: 3108 },
  { unitRef: "4500-3001", suite: "3001", name: "Hilti",          sqft: 3200,  camEscrow: 24444, insEscrow: 444,  retEscrow: 6204 },
  { unitRef: "4500-3021", suite: "3021", name: "Fresh Grocer",   sqft: 56648, camEscrow: 231600, insEscrow: 7200, retEscrow: 108000 },
  // Billboard parcel: gross CAM/INS (no SF), pays 100% of its own parcel RET.
  { unitRef: "4500-3000", suite: "3000", name: "Clear Channel",  sqft: 0,     flatRet: 3017, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
  // USPS recovers RET only (excluded from CAM + INS in propertyRules).
  { unitRef: "4500-3005", suite: "3005", name: "USPS",           sqft: 1600,  camEscrow: 0, insEscrow: 0, retEscrow: 0 },
  // PLCB — gross lease (grossLease in the config seed); pays nothing.
  { unitRef: "4500-3009", suite: "3009", name: "PLCB",           sqft: 8000,  camEscrow: 0, insEscrow: 0, retEscrow: 0 },
];

export const TENANTS_4500_2025 = assembleRetail(POOL_4500, ROSTER_4500_2025, GLA_4500);
