export type CommissionEntry = {
  id: string;
  /** Display label for the quarter, e.g. "1st Quarter 2026". */
  quarter: string;
  tenant: string;
  building: string;
  suite: string;
  sqft: number;
  /** ISO-ish date strings (yyyy-mm-dd or m/d/yyyy). Stored as user-entered text for simplicity. */
  leaseFrom: string;
  leaseTo: string;
  termYears: number;
  incentiveAmount: number;
  comments: string;
  /** Original rent-roll unit reference if auto-populated; blank for manual entries. */
  unitRef?: string;
  /** Unix ms — for sort/display. */
  createdAt: number;
};

/** Per-year incentive rates mirroring Stacie's XLOOKUP table.
 *  Exact-match lookup just like the spreadsheet formula. */
export const INCENTIVE_TIERS: { years: number; ratePerSqft: number }[] = [
  { years: 5,   ratePerSqft: 0.36  },
  { years: 4,   ratePerSqft: 0.32  },
  { years: 3,   ratePerSqft: 0.30  },
  { years: 2,   ratePerSqft: 0.20  },
  { years: 1,   ratePerSqft: 0.15  },
  { years: 0.5, ratePerSqft: 0.075 },
];

/** Exact-match lookup mirroring the spreadsheet XLOOKUP formula.
 *  Returns null when the term isn't a standard value. */
export function incentiveRate(termYears: number): number | null {
  const eps = 1e-6;
  for (const t of INCENTIVE_TIERS) {
    if (Math.abs(t.years - termYears) < eps) return t.ratePerSqft;
  }
  return null;
}

/** Computes incentive amount = rate × sqft. Returns null if term isn't standard. */
export function computeIncentive(termYears: number, sqft: number): number | null {
  const rate = incentiveRate(termYears);
  if (rate == null) return null;
  return Math.round(rate * sqft * 100) / 100;
}

/** Years between two date-like strings. Returns 0 if either is unparseable. */
export function termYearsBetween(from: string, to: string): number {
  const f = parseDateLoose(from);
  const t = parseDateLoose(to);
  if (!f || !t || t < f) return 0;
  const days = (t.getTime() - f.getTime()) / 86400000;
  // Include the end day so 1/1 to 12/31 of same year reads as ~1 year (365 days).
  return Math.round(((days + 1) / 365.25) * 10) / 10;
}

function parseDateLoose(s: string): Date | null {
  if (!s) return null;
  const t = s.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (us) {
    const y = Number(us[3]);
    return new Date(y < 100 ? 2000 + y : y, Number(us[1]) - 1, Number(us[2]));
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Builds the next-N quarter labels relative to today, ordered most recent first.
 *  Short format like "Q2 26" to save horizontal space in the form. */
export function recentQuarterLabels(count: number = 8, now: Date = new Date()): string[] {
  const out: string[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.push(`Q${q} ${String(y).slice(-2)}`);
    q--;
    if (q < 1) { q = 4; y--; }
  }
  return out;
}

/** Suite parsed off the rent roll unitRef "3610-0205" → "205". */
export function suiteFromUnitRef(unitRef: string): string {
  const parts = unitRef.split("-");
  if (parts.length < 2) return "";
  return parts.slice(1).join("-").replace(/^0+/, "");
}

/** Building (property code) parsed off the rent roll unitRef "3610-0205" → "3610". */
export function buildingFromUnitRef(unitRef: string): string {
  return unitRef.split("-")[0] || "";
}
