// Building 7 (4070) reconciliation seed, extracted verbatim from the
// 4070_2025_CAM_and_RET_Billing workbook ("Expenses & Occ", "Tenant
// Inputs", "Building" tabs). Used to validate the engine against a
// known-good year-end reconciliation; once the live Expenses & Occ import
// and December rent roll feed these values, this seed becomes the fixture
// the tie-out test runs against.

import type { OfficeExpensePool, OfficeTenantInput } from "../types";
import { assembleTenantInputs, type OfficeLeaseConfig, type RosterUnit, type ResetInfo } from "../assemble";

const Y = [2014, 2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

function zip(vals: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  Y.forEach((y, i) => {
    if (vals[i] != null) out[String(y)] = vals[i];
  });
  return out;
}

export const POOL_4070: OfficeExpensePool = {
  propertyCode: "4070",
  retAccount: "6410-8502",
  retLabel: "Rate x Building Sq. Ft",
  rentableSqft: 61508,
  updatedAt: "2026-02-03",
  values: {
    "6130-8502": zip([12548, 11604, 15067, 15805, 15874.79, 14311.99, 16445, 18155.35, 19544.27, 18115.85]),
    "6220-8502": zip([68194, 25862, 83064, 73961, 73013.68, 88823.34, 77866.23, 84595.64, 84521.48, 87896]),
    "6030-8502": zip([18048, 20711, 20475, 21047, 20237.5, 16380, 10959, 8280, 8280, 10608]),
    "6270-8502": zip([10565, 9410, 14078, 16535, 13532.09, 14211.1, 17737.85, 18730.47, 22077.55, 25698.5]),
    "6360-8502": zip([10193, 5493, 7090, 16186, 3009.52, 6459.28, 25304.08, 5794.19, 7505.12, 8268.93]),
    "6350-8502": zip([11103, 12693, 11346, 8645, 10237.49, 10774.26, 7580, 3909.96, 3046.3, 5856]),
    "6370-8502": zip([23414.67, 16261.33, 14892, 7957.33, 3435.63, 9531.13, 7178.04, 0, 9341.34, 12273.32]),
    "6380-8502": zip([20817, 26802, 28024, 22167, 25697.95, 23964.46, 26046.35, 33765.99, 25160.45, 18482]),
    "6510-8502": zip([13569, 13105, 12870, 16916, 16488, 24639.66, 25371.46, 31164.45, 34022.62, 34920.36]),
    "6610-8502": zip([30126, 28295, 42921, 43561, 48559.75, 48786.49, 50527.79, 43982.68, 38394.52, 39678.16]),
    "6990-8502": zip([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    "6250-8502": zip([68810, 76223, 75616, 79918, 78155.5, 85581.43, 83211.27, 80696.29, 76463.82, 76053.65]),
    // 95%-occupancy grossed-up variants (Management Fee, Cleaning).
    "6610-8502-95": zip([
      30126, 28295, 47290.740878692646, 50462.820013580284, 53293.874156680809,
      50836.218723037986, 55894.264750994291, 53135.406529561049, 52213.991571534127, 56227.595691663475,
    ]),
    "6250-8502-95": zip([
      68810, 76223, 83314.38368824638, 92580.235757795032, 85774.934624920163,
      89177.071236532167, 92049.004234035747, 97489.061025325238, 103985.70559046716, 107775.004765223,
    ]),
    // Real estate taxes.
    "6410-8502": zip([
      158075.56, 152539.84, 156230.32, 159853.1412, 142457, 130168.81, 130550.58, 144882.22, 137584.43, 151204.465,
    ]),
  },
  // Order matches the tenant-page Schedule of Expenses.
  opexLines: [
    { glAccount: "6130-8502", label: "Water and Sewer" },
    { glAccount: "6220-8502", label: "General Maintenance and Repair" },
    { glAccount: "6030-8502", label: "Maintenance Salaries" },
    { glAccount: "6270-8502", label: "Trash Removal" },
    { glAccount: "6360-8502", label: "Parking Lot Maintenance" },
    { glAccount: "6350-8502", label: "Security" },
    { glAccount: "6370-8502", label: "Snow Removal" },
    { glAccount: "6380-8502", label: "Landscaping" },
    { glAccount: "6510-8502", label: "Insurance" },
    { glAccount: "6610-8502", label: "Management Fee", grossUpAccount: "6610-8502-95" },
    { glAccount: "6990-8502", label: "Condo" },
    { glAccount: "6250-8502", label: "Cleaning", grossUpAccount: "6250-8502-95" },
  ],
};

// Lease-level config (not on the rent roll): base year + gross-up come from
// tenant metadata, pro-rata from CAMPRep, escrow from collections.
export const LEASE_CONFIG_4070_2025: Record<string, OfficeLeaseConfig> = {
  "4070-103": { baseYear: 2022, grossUp: true, proRataPct: 2.2,  opexEscrow: 2100,  retEscrow: 120 },
  "4070-107": { baseYear: 2018, grossUp: true, proRataPct: 2.24, opexEscrow: 4200,  retEscrow: 0 },
  "4070-113": { baseYear: 2024, grossUp: true, proRataPct: 3.03, opexEscrow: 4500,  retEscrow: 120 },
  "4070-115": { baseYear: 2026, grossUp: true, proRataPct: 2.88, opexEscrow: 0,     retEscrow: 0 },
  "4070-116": { baseYear: 2024, grossUp: true, proRataPct: 6.61, opexEscrow: 6000,  retEscrow: 0 },
  "4070-117": { baseYear: 2019, grossUp: true, proRataPct: 6.75, opexEscrow: 5400,  retEscrow: 0 },
  "4070-201": { baseYear: 2020, grossUp: true, proRataPct: 6.3,  opexEscrow: 5000,  retEscrow: 0 },
  "4070-209": { baseYear: 2025, grossUp: true, proRataPct: 2.95, opexEscrow: 0,     retEscrow: 0 },
  "4070-211": { baseYear: 2024, grossUp: true, proRataPct: 2.46, opexEscrow: 1200,  retEscrow: 240 },
  "4070-215": { baseYear: 2021, grossUp: true, proRataPct: 3.43, opexEscrow: 5700,  retEscrow: 414 },
  "4070-301": { baseYear: 2022, grossUp: true, proRataPct: 10.91, opexEscrow: 8000, retEscrow: 1200 },
  "4070-400": { baseYear: 2023, grossUp: true, proRataPct: 5.91, opexEscrow: 6000,  retEscrow: 840 },
  "4070-411": { baseYear: 2022, grossUp: true, proRataPct: 5.66, opexEscrow: 18000, retEscrow: 1200 },
  "4070-415": { baseYear: 2022, grossUp: true, proRataPct: 11.63, opexEscrow: 14400, retEscrow: 1200 },
};

// Rent-roll roster (the slice the assembler needs): SF + lease dates the
// December rent roll carries. Partial-year leases drive the occupancy %;
// full-year tenants use sentinel dates. Stand-in for the live Dec snapshot.
// Rent-roll roster. leaseFrom = commencement (RCD); a mid-year leaseFrom
// makes a genuine move-in partial (GLT). Continuing tenants keep their RCD
// and a sentinel end — a lease expiring mid-year does NOT reduce occupancy.
// opexMonth / reTaxMonth are the current monthly CAM / RET estimate charges
// from the rent roll ("Charges" column on the CAM EST BILLING sheet) — the
// 2026 estimate being billed. Reset tenants show $0 (new base = current year).
const FULL_TO = "12/31/2030";
export const ROSTER_4070_2025: RosterUnit[] = [
  { unitRef: "4070-103", occupantName: "Bucks County Transportation", sqft: 1285, isVacant: false, leaseFrom: "2/15/2011", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4070-107", occupantName: "O.S.S.V .Management, LLC",     sqft: 1311, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 350, reTaxMonth: 0 },
  { unitRef: "4070-113", occupantName: "McQuoid Financial Group, Inc.", sqft: 1771, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 375, reTaxMonth: 10 },
  { unitRef: "4070-115", occupantName: "GLT Transportation, LLC",      sqft: 1693, isVacant: false, leaseFrom: "12/1/2025", leaseTo: "11/30/2026", opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4070-116", occupantName: "Rothkoff Law Group, P.C.",     sqft: 3861, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 500, reTaxMonth: 0 },
  { unitRef: "4070-117", occupantName: "Belden Brick Sales & Service", sqft: 3945, isVacant: false, leaseFrom: "3/4/2005", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4070-201", occupantName: "Robert Half International, Inc", sqft: 3680, isVacant: false, leaseFrom: "1/1/2010", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4070-209", occupantName: "Ryan R. Janis P.C.",           sqft: 1725, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 0 },
  { unitRef: "4070-211", occupantName: "AIM - USA LLC",                sqft: 1438, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 100, reTaxMonth: 20 },
  { unitRef: "4070-215", occupantName: "Law Ofcs. of Michael P. Clarke", sqft: 2004, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 475, reTaxMonth: 30 },
  { unitRef: "4070-301", occupantName: "Veltri, Inc.",                 sqft: 6374, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 100 },
  { unitRef: "4070-400", occupantName: "Mette, Evans & Woodside",      sqft: 3455, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 500, reTaxMonth: 70 },
  { unitRef: "4070-411", occupantName: "Refresh Management, LLC",      sqft: 3308, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 1500, reTaxMonth: 100 },
  { unitRef: "4070-415", occupantName: "Veltri, Inc.",                 sqft: 6795, isVacant: false, leaseFrom: "1/1/2000", leaseTo: FULL_TO, opexMonth: 0, reTaxMonth: 100 },
];

// Base-year resets in effect for 2025. A mid-year reset prorates the
// recovery through the day before the reset (these reproduce the workbook's
// partial figures, now correctly attributed to resets rather than move-outs).
export const RESETS_4070_2025: Record<string, ResetInfo> = {
  "4070-103": { resetDate: "2025-07-01", originalBaseYear: 2022, newBaseYear: 2025 },
  "4070-117": { resetDate: "2025-08-01", originalBaseYear: 2019, newBaseYear: 2025 },
  "4070-201": { resetDate: "2025-07-01", originalBaseYear: 2020, newBaseYear: 2025 },
};

// Tenant inputs for the 2025 reconciliation, assembled from the roster +
// lease config + resets — the same path the live December rent roll will take.
export const TENANTS_4070_2025: OfficeTenantInput[] =
  assembleTenantInputs(ROSTER_4070_2025, 2025, LEASE_CONFIG_4070_2025, RESETS_4070_2025);
