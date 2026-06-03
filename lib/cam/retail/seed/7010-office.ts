// Parkwood Shopping/Office Center (7010) — OFFICE portion (8503 accounts +
// the 14% Maintenance Salaries allocation). Pro-rata over the office GLA
// (12,179 sf). Parkwood Medical (203) is the only active payer (no admin);
// Foot & Ankle (201) and Parkwood Medical Storage (218) are gross leases; the
// rest are vacant.

import type { RetailExpensePool } from "../types";
import { assembleRetail, type RetailRosterUnit } from "../assemble";

const OFFICE_GLA = 12179;

export const POOL_7010_OFFICE: RetailExpensePool = {
  propertyCode: "7010",
  reconYear: 2025,
  camLines: [
    { glAccount: "6030-8502", label: "Maintenance Salaries (14%)", amount: 3914.40 },
    { glAccount: "6250-8503", label: "Cleaning", amount: 21606.86 },
    { glAccount: "6120-8503", label: "Electric", amount: 966 },
    { glAccount: "6130-8503", label: "Water / Sewer", amount: 4198 },
    { glAccount: "6220-8503", label: "Building Maintenance", amount: 21956 },
    { glAccount: "6330-8503", label: "Parking Lot Cleaning", amount: 5816 },
    { glAccount: "6350-8503", label: "Security", amount: 27267 },
    { glAccount: "6360-8503", label: "Parking Lot Maintenance", amount: 12507 },
    { glAccount: "6370-8503", label: "Snow Removal", amount: 8160.80 },
    { glAccount: "6270-8503", label: "Trash Removal", amount: 6672.96 },
    { glAccount: "6380-8503", label: "Landscaping", amount: 3304.31 },
    { glAccount: "—", label: "Liability Insurance", amount: 6121.07 },
  ],
  insAmount: 1281.07,
  retAmount: 22129,
};

export const ROSTER_7010_OFFICE_2025: RetailRosterUnit[] = [
  // Foot & Ankle (201) and Storage (218) are gross (grossLease in config seed).
  { unitRef: "7010-201", suite: "201", name: "Foot and Ankle Center of Phila", sqft: 2471, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
  { unitRef: "7010-203", suite: "203", name: "Parkwood Medical", sqft: 2157, adminFeePct: 0, camEscrow: 18156, insEscrow: 180, retEscrow: 4308 },
  { unitRef: "7010-218", suite: "218", name: "Parkwood Medical (storage)", sqft: 557, camEscrow: 0, insEscrow: 0, retEscrow: 0 },
];

export const TENANTS_7010_OFFICE_2025 = assembleRetail(POOL_7010_OFFICE, ROSTER_7010_OFFICE_2025, OFFICE_GLA);
