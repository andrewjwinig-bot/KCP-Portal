// Brookwood Shopping Center (2300) retail reconciliation — connected build:
//   • PRS per category ← propertyRules.ts denominators (CAM 56,572 / INS 48,772
//     / RET 61,572) + Wawa/M&T/Dunkin carve-outs.
//   • Admin fee, line exclusions, Planet Fitness cap ← the CAMPRep config seed
//     (lib/cam/retailConfigSeed.ts) — the same data on the tenant pages.
//   • Expense pools + escrow billed + RET discounts ← the 2025 CAM workbook.
// Line labels match CAM_LINE_ITEMS where a tenant excludes them so the
// exclusion lookup resolves.

import type { RetailExpensePool } from "../types";
import { assembleRetail, type RetailRosterUnit } from "../assemble";

const GLA_2300 = 61572;

export const POOL_2300: RetailExpensePool = {
  propertyCode: "2300",
  reconYear: 2025,
  camLines: [
    { glAccount: "6030-8502", label: "Maintenance Salaries", amount: 23520 },
    { glAccount: "6120-8502", label: "Electric (Common)", amount: 7118.67, nonControllable: true },
    { glAccount: "6130-8502", label: "Water / Sewer", amount: 0, nonControllable: true },
    { glAccount: "6220-8502", label: "Building Maintenance", amount: 23786 },
    { glAccount: "6330-8502", label: "Parking Lot Cleaning", amount: 9116.94 },
    { glAccount: "6270-8502", label: "Trash Removal", amount: 12530.92 },
    { glAccount: "6350-8502", label: "Security", amount: 27752.96 },
    { glAccount: "6360-8502", label: "Parking Lot Maintenance", amount: 46775.40 },
    { glAccount: "6370-8502", label: "Snow Removal", amount: 47294, nonControllable: true },
    { glAccount: "6380-8502", label: "Landscaping", amount: 15257.98 },
    { glAccount: "—", label: "Liability Insurance", amount: 40126.88, nonControllable: true },
  ],
  insAmount: 9259.34,   // Property Insurance
  retAmount: 152574.95, // Real Estate Taxes (adjusted)
};

const LIABILITY = 40126.88; // Wawa's insurance is billed on the liability line.

// RET discount %, admin, exclusions, cap all live in the CAM config seed
// (lib/cam/retailConfigSeed.ts) — the unit-page source of truth. The roster
// carries only rent-roll facts (SF, escrow billed) + the Wawa INS override.
export const ROSTER_2300_2025: RetailRosterUnit[] = [
  { unitRef: "2300-1817", suite: "1817", name: "M&T Bank",            sqft: 3800,  camEscrow: 16656, insEscrow: 0,    retEscrow: 8364 },
  { unitRef: "2300-1847", suite: "1847", name: "Crafty Crab",         sqft: 12759, camEscrow: 68400, insEscrow: 2496, retEscrow: 28644 },
  { unitRef: "2300-1851", suite: "1851", name: "Planet Fitness",      sqft: 20433, camEscrow: 69600, insEscrow: 5376, retEscrow: 44952 },
  { unitRef: "2300-1861", suite: "1861", name: "Edible Arrangements", sqft: 2000,  camEscrow: 10896, insEscrow: 528,  retEscrow: 4488 },
  { unitRef: "2300-1863", suite: "1863", name: "Cohen Fashion Optical", sqft: 1600, camEscrow: 7920,  insEscrow: 420,  retEscrow: 3588 },
  { unitRef: "2300-1867", suite: "1867", name: "T-Mobile Northeast LLC", sqft: 3200, camEscrow: 16776, insEscrow: 840, retEscrow: 7044 },
  { unitRef: "2300-1869", suite: "1869", name: "China Sun",           sqft: 1600,  camEscrow: 8712,  insEscrow: 420,  retEscrow: 3588 },
  { unitRef: "2300-1871", suite: "1871", name: "Lee's Hoagie House",  sqft: 1600,  camEscrow: 7920,  insEscrow: 420,  retEscrow: 3588 },
  { unitRef: "2300-1877", suite: "1877", name: "Evolve Nails",        sqft: 1600,  camEscrow: 5112,  insEscrow: 420,  retEscrow: 2100 },
  { unitRef: "2300-1879", suite: "1879", name: "GNC/Live Well",       sqft: 1280,  camEscrow: 6391,  insEscrow: 308,  retEscrow: 2629 },
  { unitRef: "2300-1881", suite: "1881", name: "Citizens Bank of PA", sqft: 2700,  camEscrow: 14700, insEscrow: 708,  retEscrow: 5940 },
  { unitRef: "2300-1885", suite: "1885", name: "Dunkin Donuts",       sqft: 4000,  camEscrow: 15936, insEscrow: 0,    retEscrow: 8796 },
  // Wawa outparcel: no CAM; insurance billed on the liability line at full GLA.
  { unitRef: "2300-1883", suite: "1883", name: "Wawa",               sqft: 5000,  insPoolOverride: LIABILITY, camEscrow: 0, insEscrow: 1812, retEscrow: 11004 },
];

export const TENANTS_2300_2025 = assembleRetail(POOL_2300, ROSTER_2300_2025, GLA_2300);
