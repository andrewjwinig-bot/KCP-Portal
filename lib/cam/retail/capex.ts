// AMORTIZED CAPITAL PROJECTS RECOVERED THROUGH CAM — one list.
//
// A capital project (a parking-lot rebuild) is not an operating expense, so
// it is not in the GL's CAM lines; the lease lets the landlord recover it over
// years, as a fixed amount a year. Each entry here is one such amortization:
// the CAM line it appears as, the yearly amount, the years it is billed, and
// WHO pays it. A tenant who signed AFTER the project never pays it (owner:
// "it should only be applied to tenants who were occupying their space during
// the time of the project … dont apply the CAM to new tenants who have leased
// space after it"), judged by the rent roll's ORIGINAL lease-from date.
//
// Read by the reconciliation (a recon year inside the term gets the line,
// excluded for tenants who arrived later) and by the budget's CAM estimates (a
// FIXED amount for the budget year — never grown, never scaled by the pool).
// Pure, client-safe: the recon page's ⓘ draws the schedule from it.

export type CapexAmortization = {
  property: string;
  /** The CAM line it is billed as — the label exclusions are matched on. */
  label: string;
  /** What the project was, where known. */
  project?: string;
  /** The year the work was done; a tenant whose lease began after it is out. */
  projectYear?: number;
  /** Recovered each year of the term. */
  annual: number;
  /** First and last year recovered through CAM (null = not on file). */
  firstYear: number | null;
  lastYear: number | null;
  /** A lease beginning on or before this date shares it (ISO). */
  occupiedBy?: string;
  /** Tenants the lease itself excludes, by unit ref. */
  excludedUnits?: string[];
  /** The amortization schedule as kept by the team — each year's amount, the
   *  last one often a partial. Wins over `annual` for the years it lists. */
  schedule?: { year: number; amount: number }[];
  /** Left to recover at the start of the schedule's first year. */
  openingBalance?: number;
  /** The project's cost and how it came to the amortized figure. */
  cost?: { invoices: number; less?: { label: string; amount: number }; amortized: number; years: number };
  /** Recovered before the schedule starts. */
  billedBefore?: { year: number; amount: number }[];
  note?: string;
};

export const CAPEX_AMORTIZATIONS: CapexAmortization[] = [
  {
    property: "9510",
    label: "Parking Lot Cap Ex",
    // The "2022 thru 2024 ADA Costs – FINAL" package (owner, 11/2026): the
    // parking lot / ADA work billed 2022–2024 — Associated Paving, Aarons
    // Asbestos (retaining wall), Belden — less the engineering and fence
    // invoices, over 15 years.
    project: "Parking lot & ADA improvements, 2022–2024",
    projectYear: 2024,
    cost: { invoices: 551188.28, less: { label: "Engineering fees & fence", amount: 17622.74 }, amortized: 533565.54, years: 15 },
    billedBefore: [{ year: 2023, amount: 8152 }, { year: 2024, amount: 35571 }],
    annual: 35571,
    firstYear: 2023,
    lastYear: 2038,
    excludedUnits: ["9510-406"],
    // The team's schedule: $489,842.54 left at the start of 2025, $35,571 a
    // year, the last $27,419.54 in 2038.
    openingBalance: 489842.54,
    schedule: [
      ...Array.from({ length: 13 }, (_, i) => ({ year: 2025 + i, amount: 35571 })),
      { year: 2038, amount: 27419.54 },
    ],
    note: "Wawa's lease excludes it.",
  },
  {
    property: "2300",
    label: "Cap Ex Amortization (2021 Project)",
    project: "Parking lot paving, completed 12/10/2021",
    projectYear: 2021,
    annual: 46353.44,
    firstYear: 2026,
    lastYear: 2031,
    occupiedBy: "2021-12-10",
    note: "Tenants in their space during the 2021 project share it; a lease that began after it does not.",
  },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function capexFor(property: string): CapexAmortization[] {
  return CAPEX_AMORTIZATIONS.filter((c) => c.property === property);
}

/** The amount recovered in `year`: the annual inside the term, 0 outside it.
 *  An entry with no term on file is treated as running. */
export function capexAmountIn(c: CapexAmortization, year: number): number {
  const listed = c.schedule?.find((r) => r.year === year) ?? c.billedBefore?.find((r) => r.year === year);
  if (listed) return listed.amount;
  if (c.firstYear != null && year < c.firstYear) return 0;
  if (c.lastYear != null && year > c.lastYear) return 0;
  return c.annual;
}

/** By the CAM line's label alone (labels are distinct across properties). */
export function capexByLabelAny(label: string): CapexAmortization | null {
  const k = label.trim().toLowerCase();
  return CAPEX_AMORTIZATIONS.find((c) => c.label.toLowerCase() === k) ?? null;
}

export function capexByLabel(property: string, label: string): CapexAmortization | null {
  const k = label.trim().toLowerCase();
  return capexFor(property).find((c) => c.label.toLowerCase() === k) ?? null;
}

/** "MM/DD/YY" or ISO → ISO, else null. */
function toIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (m[3].length === 2) y += y > 50 ? 1900 : 2000;
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Does this tenant share the project? Its lease excludes it → no; a lease
 *  beginning after `occupiedBy` → no; no lease date on file → yes (an
 *  existing tenant on the reconciliation). */
export function sharesCapex(c: CapexAmortization, unitRef: string, leaseFrom?: string | null): boolean {
  if (c.excludedUnits?.includes(unitRef)) return false;
  if (!c.occupiedBy) return true;
  const from = toIso(leaseFrom);
  return !from || from <= c.occupiedBy;
}

/** Year-by-year schedule for the ⓘ: each year's amount and what is left. */
export function capexSchedule(c: CapexAmortization): { year: number; amount: number; remaining: number }[] {
  if (c.schedule?.length) {
    let left = round2(c.openingBalance ?? c.schedule.reduce((a, r) => a + r.amount, 0));
    return c.schedule.map((r) => {
      left = round2(left - r.amount);
      return { year: r.year, amount: r.amount, remaining: Math.max(0, left) };
    });
  }
  if (c.firstYear == null || c.lastYear == null) return [];
  const years = Array.from({ length: c.lastYear - c.firstYear + 1 }, (_, i) => c.firstYear! + i);
  let left = round2(c.annual * years.length);
  return years.map((year) => {
    left = round2(left - c.annual);
    return { year, amount: c.annual, remaining: Math.max(0, left) };
  });
}

export function capexTotal(c: CapexAmortization): number | null {
  if (c.schedule?.length) return round2(c.openingBalance ?? c.schedule.reduce((a, r) => a + r.amount, 0));
  if (c.firstYear == null || c.lastYear == null) return null;
  return round2(c.annual * (c.lastYear - c.firstYear + 1));
}
