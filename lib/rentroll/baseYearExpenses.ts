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
  /** Billed directly to tenants (e.g. electric) — not part of Op Ex. */
  separateCharge?: boolean;
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
  /** year → 12 monthly occupied SF (Jan–Dec) from the workbook */
  occupancyMonthly: Record<string, number[]>;
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
 * The GL lines that compose the grossed-up Op Ex total: the 95%-occupancy
 * variants where they exist, the as-is line otherwise, and never a
 * separately-billed charge such as electric.
 */
export function grossedUpLines(p: PropertyExpenses): ExpenseLine[] {
  const superseded = new Set(
    p.lines
      .filter((l) => l.glAccount.endsWith("-95"))
      .map((l) => l.glAccount.slice(0, -3)),
  );
  return p.lines.filter((l) => {
    if (l.separateCharge) return false;
    if (l.glAccount.endsWith("-95")) return true;
    return !superseded.has(l.glAccount);
  });
}

/**
 * Annual expense reimbursement a tenant owes. Computed per GL line: for
 * each line the tenant owes its pro-rata share of any increase over that
 * line's base-year amount, and each line is floored at zero — a line that
 * fell below its base year does NOT offset increases on other lines. RE
 * taxes are treated as one additional line when the basis includes them.
 */
export function reimbursement(
  p: PropertyExpenses,
  tenantSqft: number,
  baseYear: number,
  compareYear: number,
  basis: BaseYearBasis,
): number | null {
  const baseYs = String(baseYear);
  const curYs = String(compareYear);
  if (
    p.rentableSqft <= 0 ||
    p.opExGrossedUp[baseYs] == null ||
    p.opExGrossedUp[curYs] == null
  ) {
    return null;
  }
  const share = tenantSqft / p.rentableSqft;
  let increase = 0;
  for (const line of grossedUpLines(p)) {
    const b = line.values[baseYs] ?? 0;
    const c = line.values[curYs] ?? 0;
    increase += Math.max(0, c - b);
  }
  if (basis === "opexRet") {
    increase += Math.max(0, (p.ret[curYs] ?? 0) - (p.ret[baseYs] ?? 0));
  }
  return increase * share;
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
  occupancyMonthly: {
    "2010": [31205, 31205, 30371, 30371, 30371, 32209, 32209, 32821, 32821, 32821, 31784, 31784],
    "2012": [21747, 23585, 22583, 22583, 22583, 22583, 22583, 22583, 23728, 23728, 23728, 23728],
    "2016": [28053, 28053, 22631, 22631, 22631, 23776, 26170, 25168, 23806, 24953, 25565, 25565],
    "2018": [34346, 32917, 35439, 35439, 35439, 32069, 32069, 32069, 33498, 33498, 33498, 33498],
    "2019": [33498, 33498, 33498, 33498, 33498, 32886, 32358, 32358, 34609, 33298, 33298, 34438],
    "2020": [33818, 33818, 33818, 33818, 33818, 34438, 31266, 29428, 29428, 29428, 29428, 23367],
    "2021": [25141, 25141, 25141, 25141, 25141, 25141, 25141, 25141, 24529, 25141, 25141, 25141],
    "2022": [25141, 28511, 28511, 27911, 28511, 28511, 27417, 27417, 28511, 27899, 27899, 27899],
    "2023": [27899, 27899, 27899, 27899, 27899, 27899, 28511, 28511, 27899, 27899, 27899, 25535],
    "2024": [25535, 19931, 19931, 19931, 19931, 20543, 20543, 20543, 21637, 21018, 21018, 21018],
    "2025": [21428, 22522, 20684, 20684, 20684, 21995, 21995, 20435, 20435, 20435, 19006, 19006],
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
    { glAccount: "6120-8502", label: "Electric", separateCharge: true, values: { "2021": 42984, "2022": 40821, "2023": 37268, "2024": 40821, "2025": 0 } },
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
  occupancyMonthly: {
    "2005": [34255, 34255, 34255, 32984, 28150, 28150, 28150, 29152, 29152, 29152, 29152, 29152],
    "2011": [34255, 34255, 34255, 32984, 28150, 28150, 28150, 29152, 29152, 29152, 29152, 29152],
    "2014": [34255, 34255, 34255, 32984, 28150, 28150, 28150, 29152, 29152, 29152, 29152, 29152],
    "2017": [18652, 18652, 18652, 18652, 18652, 18652, 18652, 18652, 18652, 18652, 18652, 18652],
    "2018": [20719, 28204, 28204, 28204, 28204, 27202, 27202, 27202, 27202, 27202, 27202, 27202],
    "2019": [27202, 27202, 27202, 27759, 28204, 26933, 26933, 26933, 26933, 28204, 28204, 28204],
    "2020": [28204, 28204, 28204, 28204, 27155, 27155, 24610, 24610, 24610, 24610, 25055, 28204],
    "2021": [25141, 25141, 25141, 24610, 24610, 24610, 24610, 25055, 24529, 25141, 26513, 26513],
    "2022": [26513, 30302, 30302, 30302, 30302, 30302, 30302, 30302, 30302, 30302, 30302, 30302],
    "2023": [30302, 30302, 30302, 30302, 30302, 30302, 30302, 28273, 28273, 28273, 28273, 28273],
    "2024": [26513, 26513, 26513, 26513, 26513, 26513, 26513, 26513, 26513, 26513, 26513, 26513],
    "2025": [20913, 20913, 20913, 20913, 20913, 20913, 20913, 20913, 20913, 20913, 20913, 20913],
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
    { glAccount: "6120-8502", label: "Electric", separateCharge: true, values: { "2021": 52180, "2022": 47373, "2023": 47373, "2024": 47373, "2025": 0 } },
  ],
  updatedAt: "2026-02-02",
};

// 3640 — Building 4. No operating-expense data for 2010, 2012 or 2013.
const YEARS_3640 = [
  2005, 2011, 2014, 2015, 2016, 2017, 2018,
  2019, 2020, 2021, 2022, 2023, 2024, 2025,
];

const SEED_3640: PropertyExpenses = {
  propertyCode: "3640",
  rentableSqft: 48794,
  opEx: zip(YEARS_3640, [
    204038, 189676, 304716, 183994, 186925, 205719, 226963,
    243000, 239316, 261943, 274896, 284876, 227889, 220973,
  ]),
  opExGrossedUp: zip(YEARS_3640, [
    204038, 189676, 363752, 339959, 247249, 233726, 264217,
    260807, 248061, 271186, 280956, 288189, 239207, 233557,
  ]),
  ret: zip(YEARS_3640, [
    94660, 115409, 101004, 91733, 93197, 94172, 94660,
    97100, 99100, 97100, 100355, 101043, 105762, 119057,
  ]),
  occupancyPct: {
    "2014": 55, "2015": 28, "2016": 38, "2017": 65, "2018": 65, "2019": 78,
    "2020": 87, "2021": 87, "2022": 90, "2023": 92, "2024": 85, "2025": 84,
  },
  occupancyMonthly: {
    "2014": [39105, 35427, 35427, 35427, 35427, 20224, 20224, 20224, 20224, 20224, 20224, 20224],
    "2015": [14357, 14357, 14357, 14357, 14357, 14357, 11222, 11222, 12257, 12257, 15569, 15569],
    "2016": [15569, 15569, 15569, 16563, 16563, 16563, 18323, 21458, 21458, 21458, 22615, 22615],
    "2017": [22307, 22307, 31868, 31868, 31868, 31868, 31868, 32790, 32790, 36130, 36130, 36912],
    "2018": [22307, 22307, 31868, 31868, 31868, 31868, 31868, 32790, 32790, 36130, 36130, 36912],
    "2019": [36912, 36912, 36912, 36912, 36912, 36117, 36117, 36912, 36912, 36912, 44312, 44312],
    "2020": [41331, 45009, 45009, 45009, 42219, 41437, 42219, 41297, 41297, 40502, 42219, 42219],
    "2021": [41331, 45009, 45009, 45009, 42219, 41437, 42219, 41297, 41297, 40502, 42219, 42219],
    "2022": [42219, 42219, 42219, 42219, 42219, 42219, 42219, 42219, 42219, 42219, 42219, 42219],
    "2023": [45009, 45009, 45009, 45009, 45009, 45009, 45009, 45009, 45009, 45009, 45009, 44214],
    "2024": [44214, 42926, 42926, 43721, 43721, 40043, 39008, 39008, 39008, 39008, 41331, 41331],
    "2025": [40536, 40536, 40536, 40536, 40536, 40536, 41331, 41331, 41331, 41331, 41331, 41331],
  },
  lines: [
    { glAccount: "6130-8502", label: "Water / Sewer", values: zip(YEARS_3640, [11663, 10523, 7248, 9380, 7682, 7542, 7425, 8753, 8221, 8584, 10000, 13803, 10368, 11242]) },
    { glAccount: "6220-8502", label: "Building Maintenance", values: zip(YEARS_3640, [32809, 29374, 38190, 26752, 40061, 56365, 51274, 61483, 34201, 46267, 59611, 69732, 41621, 30036]) },
    { glAccount: "6030-8502", label: "Maintenance Salaries", values: zip(YEARS_3640, [15365, 14424, 13953, 14546, 16390, 16923, 13884, 16653, 16013, 17176, 11438, 8160, 9300, 11076]) },
    { glAccount: "6270-8502", label: "Trash Removal", values: zip(YEARS_3640, [2631, 5165, 72324, 1325, 529, 983, 1140, 569, 696, 225, 963, 162, 311, 205]) },
    { glAccount: "6330-8502", label: "Parking Lot Maint.", values: zip(YEARS_3640, [10305, 7919, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6350-8502", label: "Security", values: zip(YEARS_3640, [8336, 8647, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6370-8502", label: "Snow Removal", values: zip(YEARS_3640, [14705, 5230, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { glAccount: "6380-8502", label: "Landscaping", values: zip(YEARS_3640, [9916, 9768, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 594]) },
    { glAccount: "6510-8502", label: "Insurance", values: zip(YEARS_3640, [13021, 9442, 12059, 0, 10090, 11966, 9792, 12953, 12884, 19250, 17845, 18451, 20880, 20977]) },
    { glAccount: "6990-8502", label: "Condo", values: zip(YEARS_3640, [0, 0, 79563, 66648, 71405, 52201, 63984, 61440, 71400, 69084, 69084, 69084, 51813, 51813]) },
    { glAccount: "6610-8502", label: "Management Fee", values: zip(YEARS_3640, [35196, 30603, 23417, 10978, 14167, 19442, 27588, 28783, 31605, 34629, 33924, 35340, 31100, 31522]) },
    { glAccount: "6250-8502", label: "Cleaning", values: zip(YEARS_3640, [50091, 58581, 57962, 54365, 26601, 40297, 51876, 52366, 64297, 66728, 72031, 70145, 62497, 63508]) },
    { glAccount: "6610-8502-95", label: "Management Fee (95%)", grossedUp: true, values: zip(YEARS_3640, [35196, 30603, 40405, 37181, 35130, 28557, 40522, 35099, 34487, 37787, 35864, 36449, 34861, 35696]) },
    { glAccount: "6250-8502-95", label: "Cleaning (95%)", grossedUp: true, values: zip(YEARS_3640, [50091, 58581, 100010, 184127, 65962, 59189, 76197, 63857, 70160, 72813, 76150, 72348, 70054, 71918]) },
    { glAccount: "6120-8502", label: "Electric", separateCharge: true, values: { "2022": 39944, "2023": 39347, "2024": 31967, "2025": 0 } },
  ],
  updatedAt: "2026-02-02",
};

/** Seeded expense history, keyed by property code. */
export const SEED_EXPENSES: Record<string, PropertyExpenses> = {
  "3610": SEED_3610,
  "3620": SEED_3620,
  "3640": SEED_3640,
};
