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

/** Normalize any accepted date string into ISO yyyy-mm-dd (for <input type="date">). */
export function toIsoDate(s: string): string {
  const d = parseDateLoose(s);
  if (!d) return "";
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${dy}`;
}

/** Format a date string as m/d/yyyy for display. Falls back to the input when unparseable. */
export function toDisplayDate(s: string): string {
  const d = parseDateLoose(s);
  if (!d) return s ?? "";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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

// ─── Journal Entry export ──────────────────────────────────────────────────

export type JEFund = "JV III" | "NI LLC";

/** Parse "Q126" or "Q2 26" → { quarter, year, last day of period (Date) }. */
export function parseQuarterLabel(label: string): { quarter: 1 | 2 | 3 | 4; year: number; periodEnd: Date } | null {
  const short = /^Q(\d)\s*(\d{2,4})/.exec(label);
  let q: number | null = null;
  let year: number | null = null;
  if (short) {
    q = Number(short[1]);
    const yr = Number(short[2]);
    year = yr < 100 ? 2000 + yr : yr;
  } else {
    const long = /^(\d)\w+ Quarter (\d{4})/.exec(label);
    if (long) { q = Number(long[1]); year = Number(long[2]); }
  }
  if (!q || !year || q < 1 || q > 4) return null;
  // Last day of the quarter: Mar 31, Jun 30, Sep 30, Dec 31
  const lastMonth = q * 3 - 1; // 0-indexed: q1→2, q2→5, q3→8, q4→11
  const periodEnd = new Date(year, lastMonth + 1, 0); // day 0 of next month = last day
  return { quarter: q as 1 | 2 | 3 | 4, year, periodEnd };
}

/** Short quarter code like "Q126" for "Q1 2026". */
export function quarterShortCode(quarter: 1 | 2 | 3 | 4, year: number): string {
  return `Q${quarter}${String(year).slice(-2)}`;
}

/** Format a Date as m/d/yy (e.g. 5/13/26). */
export function formatShortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

const COMMISSIONS_MARKUP = 1.2;

/** Builds the array-of-arrays representation of a JE import sheet for one fund + quarter.
 *  Returns `null` when no buildings have non-zero commissions. */
export function buildJournalEntryRows(opts: {
  entries: CommissionEntry[];
  fund: JEFund;
  fundBuildings: string[];   // ordered list of building codes belonging to this fund
  quarter: 1 | 2 | 3 | 4;
  year: number;
  periodEnd: Date;
  batchNumber: number;
  uniqueId: number;
}): (string | number)[][] | null {
  const { entries, fund, fundBuildings, quarter, year, periodEnd, batchNumber, uniqueId } = opts;
  const code = quarterShortCode(quarter, year);                 // "Q126"
  const description = `${code} InHouse Comm`;                   // "Q126 InHouse Comm"
  const reference = `${fund} ${code} Comm`;                     // "NI LLC Q126 Comm"
  const dateStr = formatShortDate(periodEnd);

  // Sum gross per building (only for buildings owned by this fund).
  const fundSet = new Set(fundBuildings.map((b) => b.toUpperCase()));
  const totals = new Map<string, number>();
  for (const e of entries) {
    const b = (e.building || "").toUpperCase();
    if (!fundSet.has(b)) continue;
    const gross = (Number(e.incentiveAmount) || 0) * COMMISSIONS_MARKUP;
    if (gross === 0) continue;
    totals.set(b, (totals.get(b) ?? 0) + gross);
  }

  // Preserve fund-listed order so the output is deterministic.
  const dist: { building: string; amount: number }[] = [];
  for (const b of fundBuildings) {
    const amt = totals.get(b.toUpperCase());
    if (amt && amt > 0) dist.push({ building: b, amount: round2(amt) });
  }
  if (dist.length === 0) return null;

  const total = round2(dist.reduce((s, r) => s + r.amount, 0));

  return [
    ["BTCH", "", batchNumber, uniqueId, "", 1],
    ["INVH", description, dateStr, "", total, reference, "LIKM4", dateStr, dateStr],
    ...dist.map((r) => ["DIST", r.building, "6620-8501", description, "", r.amount]),
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
