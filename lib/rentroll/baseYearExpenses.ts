// Base-year operating-expense history for the office buildings, plus the
// math Nancy uses to gauge the impact of resetting a tenant's base year.
//
// An office tenant on a base-year lease pays its pro-rata share of the
// amount by which a comparison year's operating expenses exceed the
// expenses of its locked base year. Resetting the base year forward
// raises that floor and reduces the landlord's expense recovery.
//
// Expense figures are seeded from the Korman base-year workbooks. Tenant
// base years themselves live in /api/tenant-meta (editable); square
// footage comes from the uploaded rent roll.

export const OFFICE_BUILDINGS: { code: string; name: string; fund: "JV III" | "NI LLC" }[] = [
  { code: "3610", name: "Building 1",   fund: "JV III" },
  { code: "3620", name: "Building 2",   fund: "JV III" },
  { code: "3640", name: "Building 4",   fund: "JV III" },
  { code: "4050", name: "Building 5",   fund: "NI LLC" },
  { code: "4060", name: "Building 6",   fund: "NI LLC" },
  { code: "4070", name: "Building 7",   fund: "NI LLC" },
  { code: "4080", name: "Building 8",   fund: "NI LLC" },
  { code: "40A0", name: "Kor Center A", fund: "NI LLC" },
  { code: "40B0", name: "Kor Center B", fund: "NI LLC" },
  { code: "40C0", name: "Kor Center C", fund: "NI LLC" },
];

/** A single GL line on the expense workbook (year → dollars). */
export type ExpenseLine = {
  glAccount: string;
  label: string;
  /** Whether this line is the 95%-occupancy grossed-up variant of another. */
  grossedUp?: boolean;
  values: Record<string, number>;
};

export type PropertyExpenses = {
  propertyCode: string;
  rentableSqft: number;
  /** year → total operating expense as reported (not grossed up) */
  opEx: Record<string, number>;
  /** year → total operating expense grossed up to 95% occupancy */
  opExGrossedUp: Record<string, number>;
  /** year → real estate taxes */
  ret: Record<string, number>;
  /** year → average occupancy percent (0-100), where known */
  occupancyPct: Record<string, number>;
  /** full GL detail, for the expandable breakdown */
  lines: ExpenseLine[];
  updatedAt: string;
};

export type BaseYearBasis = "opex" | "opexRet";

/** Sorted list of years for which a property has grossed-up Op Ex data. */
export function expenseYears(p: PropertyExpenses): number[] {
  return Object.keys(p.opExGrossedUp).map(Number).sort((a, b) => a - b);
}

/** Latest year with real (non-zero) grossed-up Op Ex — the default "current" year. */
export function latestExpenseYear(p: PropertyExpenses): number | null {
  const years = expenseYears(p).filter((y) => (p.opExGrossedUp[String(y)] ?? 0) > 0);
  return years.length ? years[years.length - 1] : null;
}

/** The expense floor a tenant locks in for a given year, on the chosen basis. */
export function expenseBaseFor(
  p: PropertyExpenses,
  year: number,
  basis: BaseYearBasis,
): number | null {
  const opex = p.opExGrossedUp[String(year)];
  if (opex == null) return null;
  if (basis === "opex") return opex;
  return opex + (p.ret[String(year)] ?? 0);
}

/**
 * Annual expense reimbursement a tenant owes: pro-rata share of the
 * comparison year's expenses above its base-year floor. Never negative —
 * a base year above the comparison year simply recovers nothing.
 */
export function reimbursement(
  p: PropertyExpenses,
  tenantSqft: number,
  baseYear: number,
  compareYear: number,
  basis: BaseYearBasis,
): number | null {
  const base = expenseBaseFor(p, baseYear, basis);
  const current = expenseBaseFor(p, compareYear, basis);
  if (base == null || current == null || p.rentableSqft <= 0) return null;
  const share = tenantSqft / p.rentableSqft;
  return Math.max(0, current - base) * share;
}

// ── seed data ────────────────────────────────────────────────────────────────

const YEARS_3610 = [
  2005, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017,
  2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
];

function zip(years: number[], vals: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  years.forEach((y, i) => {
    if (vals[i] != null) out[String(y)] = vals[i];
  });
  return out;
}

const SEED_3610: PropertyExpenses = {
  propertyCode: "3610",
  rentableSqft: 41821,
  opEx: zip(YEARS_3610, [
    168897, 162154, 185603, 184739, 191958, 210297, 190955, 192330, 198637,
    223826, 211268, 191962, 210383, 210281, 202595, 204601, 187845,
  ]),
  opExGrossedUp: zip(YEARS_3610, [
    168897, 181509, 185603, 233926, 191958, 210297, 190955, 221374, 198637,
    237622, 224168, 209213, 246101, 240111, 231822, 256370, 241637,
  ]),
  ret: zip(YEARS_3610, [
    79878, 94858, 97381, 96613, 97025, 86988, 81969, 82806, 83642,
    84478, 86988, 88658, 89105, 89366, 89979, 94181, 106057,
  ]),
  occupancyPct: {
    "2010": 76, "2012": 55, "2016": 60, "2018": 80, "2019": 80,
    "2020": 75, "2021": 60, "2022": 67, "2023": 66, "2024": 50, "2025": 50,
  },
  lines: [
    { glAccount: "6130-8502", label: "Water / Sewer", values: zip(YEARS_3610, [6077, 9708, 10890, 7165, 7638, 7085, 6712, 6524, 7440, 7425, 9136, 7026, 7529, 7934, 11502, 17670, 22714]) },
    { glAccount: "6220-8502", label: "Building Maintenance", values: zip(YEARS_3610, [31866, 33027, 37058, 30264, 38756, 40896, 44797, 50494, 51919, 51274, 53904, 31836, 49133, 45573, 38893, 41298, 32163]) },
    { glAccount: "6030-8502", label: "Maintenance Salaries", values: zip(YEARS_3610, [12989, 12263, 12210, 13815, 12929, 12310, 12833, 14048, 14504, 13884, 14274, 13725, 14723, 9804, 7080, 8040, 9492]) },
    { glAccount: "6270-8502", label: "Trash Removal", values: zip(YEARS_3610, [2226, 2884, 3944, 2077, 900, 1502, 1586, 435, 759, 1140, 546, 727, 194, 710, 139, 436, 264]) },
    { glAccount: "6330-8502", label: "Parking Lot Maint.", values: zip(YEARS_3610, [0, 0, 0, 1103, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6350-8502", label: "Security", values: zip(YEARS_3610, [0, 0, 0, 876, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6370-8502", label: "Snow Removal", values: zip(YEARS_3610, [0, 0, 0, 8707, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6380-8502", label: "Landscaping", values: zip(YEARS_3610, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 510]) },
    { glAccount: "6510-8502", label: "Insurance", values: zip(YEARS_3610, [13021, 7414, 7991, 8717, 10235, 10635, 8453, 8888, 10286, 9792, 11135, 11291, 16547, 15330, 15795, 17880, 17956]) },
    { glAccount: "6990-8502", label: "Condo", values: zip(YEARS_3610, [30954, 20875, 43198, 44543, 47684, 63165, 48228, 63087, 46120, 63984, 54276, 63084, 61044, 61044, 61044, 61440, 45783]) },
    { glAccount: "6610-8502", label: "Management Fee", values: zip(YEARS_3610, [29517, 27867, 24383, 18969, 23846, 23877, 27712, 16864, 23618, 27588, 25755, 23329, 20121, 22200, 22232, 17250, 16876]) },
    { glAccount: "6250-8502", label: "Cleaning", values: zip(YEARS_3610, [42247, 48116, 45929, 48503, 49970, 50827, 40634, 31990, 43991, 48739, 42242, 40943, 41093, 47686, 45909, 40587, 42086]) },
    { glAccount: "6610-8502-95", label: "Management Fee (95%)", grossedUp: true, values: zip(YEARS_3610, [29517, 34965, 24383, 32798, 23846, 23877, 27712, 26890, 23618, 32574, 30641, 29591, 31861, 31676, 31768, 32690, 32273]) },
    { glAccount: "6250-8502-95", label: "Cleaning (95%)", grossedUp: true, values: zip(YEARS_3610, [42247, 60372, 45929, 83862, 49970, 50827, 40634, 51008, 43991, 57549, 50256, 51933, 65070, 68040, 65601, 76915, 80482]) },
    { glAccount: "6120-8502", label: "Electric", values: { "2021": 42984, "2022": 40821, "2023": 37268, "2024": 40821, "2025": 0 } },
  ],
  updatedAt: "2026-02-02",
};

// 3620 — Building 2. The workbook has no operating-expense data for 2010
// or 2013 (only RET), so those two years are omitted entirely.
const YEARS_3620 = [
  2005, 2011, 2012, 2014, 2015, 2016, 2017,
  2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
];

const SEED_3620: PropertyExpenses = {
  propertyCode: "3620",
  rentableSqft: 49020,
  opEx: zip(YEARS_3620, [
    189953, 203264, 208593, 223862, 196774, 176625, 176221, 226963,
    210186, 223883, 210232, 224828, 203170, 199581, 171681,
  ]),
  opExGrossedUp: zip(YEARS_3620, [
    228530, 246648, 208593, 261402, 196774, 176625, 243872, 284578,
    252592, 270117, 252884, 257361, 235137, 239635, 228251,
  ]),
  ret: zip(YEARS_3620, [
    94609, 115087, 117010, 100981, 91667, 93138, 94118, 95099,
    97550, 99559, 97550, 100355, 101043, 105762, 119095,
  ]),
  occupancyPct: {
    "2005": 62, "2011": 62, "2014": 62, "2017": 38, "2018": 55, "2019": 56,
    "2020": 54, "2021": 51, "2022": 61, "2023": 60, "2024": 54, "2025": 43,
  },
  lines: [
    { glAccount: "6130-8502", label: "Water / Sewer", values: zip(YEARS_3620, [10878, 8847, 7833, 8183, 8214, 8746, 7460, 7425, 10807, 8478, 8015, 8283, 12650, 9208, 9121]) },
    { glAccount: "6220-8502", label: "Building Maintenance", values: zip(YEARS_3620, [39074, 31536, 29694, 46750, 39030, 34354, 41629, 51274, 46664, 52780, 45869, 55871, 39622, 37992, 31888]) },
    { glAccount: "6030-8502", label: "Maintenance Salaries", values: zip(YEARS_3620, [15365, 14424, 16169, 13953, 14546, 16390, 16923, 13884, 16653, 16013, 17176, 11438, 8160, 9300, 11076]) },
    { glAccount: "6270-8502", label: "Trash Removal", values: zip(YEARS_3620, [2631, 5140, 2224, 2171, 1649, 1363, 775, 1140, 480, 891, 715, 1185, 163, 168, 57]) },
    { glAccount: "6330-8502", label: "Parking Lot Maint.", values: zip(YEARS_3620, [0, 0, 1297, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6350-8502", label: "Security", values: zip(YEARS_3620, [0, 0, 998, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6370-8502", label: "Snow Removal", values: zip(YEARS_3620, [0, 0, 10318, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6380-8502", label: "Landscaping", values: zip(YEARS_3620, [0, 0, 1078, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 597, 0]) },
    { glAccount: "6510-8502", label: "Insurance", values: zip(YEARS_3620, [13021, 9442, 9884, 12059, 9585, 10090, 12034, 9792, 13027, 12904, 19359, 20138, 18466, 20880, 21017]) },
    { glAccount: "6990-8502", label: "Condo", values: zip(YEARS_3620, [35786, 51557, 21809, 69516, 66648, 71405, 52201, 63984, 61440, 71400, 69084, 69084, 69084, 69084, 51813]) },
    { glAccount: "6610-8502", label: "Management Fee", values: zip(YEARS_3620, [28693, 22076, 50357, 21290, 21511, 5332, 14258, 27588, 20046, 20475, 20305, 25345, 20838, 16922, 17726]) },
    { glAccount: "6250-8502", label: "Cleaning", values: zip(YEARS_3620, [44505, 60242, 56932, 49940, 35591, 28945, 30941, 51876, 41069, 40943, 29709, 33485, 34187, 36027, 28386]) },
    { glAccount: "6610-8502-95", label: "Management Fee (95%)", grossedUp: true, values: zip(YEARS_3620, [43815, 33711, 50357, 32510, 21511, 5332, 35598, 47591, 33955, 35888, 37621, 39360, 32944, 29723, 39472]) },
    { glAccount: "6250-8502-95", label: "Cleaning (95%)", grossedUp: true, values: zip(YEARS_3620, [67960, 91991, 56932, 76260, 35591, 28945, 77251, 89489, 69565, 71764, 55045, 52002, 54048, 63280, 63210]) },
    { glAccount: "6120-8502", label: "Electric", values: { "2021": 52180, "2022": 47373, "2023": 47373, "2024": 47373, "2025": 0 } },
  ],
  updatedAt: "2026-02-02",
};

/** Seeded expense history, keyed by property code. */
export const SEED_EXPENSES: Record<string, PropertyExpenses> = {
  "3610": SEED_3610,
  "3620": SEED_3620,
};
