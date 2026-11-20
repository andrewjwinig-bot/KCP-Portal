// Parkwood Professional Center (1100) retail reconciliation — connected build.
// The simplest retail center: all three categories share one GLA (8,287), no
// per-tenant exclusions, no cap, no RET discount, 10% CAM admin fee. PRS +
// admin come from the CAMPRep config seed (the tenant pages); pools + escrow
// from the 2025 CAM workbook. Suites 30/32/38 are vacant (omitted).

import type { RetailExpensePool } from "../types";
import { assembleRetail, type RetailRosterUnit } from "../assemble";

const GLA_1100 = 8287;

export const POOL_1100: RetailExpensePool = {
  propertyCode: "1100",
  reconYear: 2025,
  camLines: [
    { glAccount: "6030-8502", label: "Maintenance Salaries", amount: 3120 },
    { glAccount: "6120-8502", label: "Electric (Common)", amount: 5037.63, nonControllable: true },
    { glAccount: "6130-8502", label: "Water / Sewer", amount: 0, nonControllable: true },
    { glAccount: "6220-8502", label: "Building Maintenance", amount: 16574 },
    { glAccount: "6330-8502", label: "Parking Lot Cleaning", amount: 4628.64 },
    { glAccount: "6350-8502", label: "Security", amount: 15461.75 },
    { glAccount: "6360-8502", label: "Parking Lot Maintenance", amount: 10767.90 },
    { glAccount: "6370-8502", label: "Snow Removal", amount: 21696.35, nonControllable: true },
    { glAccount: "6380-8502", label: "Landscaping", amount: 9675.58 },
    { glAccount: "—", label: "Liability Insurance", amount: 6858.08, nonControllable: true },
  ],
  insAmount: 1067.15,  // Property Insurance
  retAmount: 16692.61, // Real Estate Taxes
};

export const ROSTER_1100_2025: RetailRosterUnit[] = [
  { unitRef: "1100-34", suite: "34", name: "Shear Sensation",    sqft: 1934, camEscrow: 14256, insEscrow: 372, retEscrow: 3612 },
  { unitRef: "1100-36", suite: "36", name: "Honest Real Estate", sqft: 1100, camEscrow: 8112,  insEscrow: 216, retEscrow: 2052 },
];

export const TENANTS_1100_2025 = assembleRetail(POOL_1100, ROSTER_1100_2025, GLA_1100);
