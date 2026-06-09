// Cash Sheet — pure helpers (no server-only deps so the page can import them).
//
// The Cash Sheet is a MONTHLY worksheet: one row per operating property
// (grouped by fund), a "Starting Cash" column pulled from the prior month's
// Operating Statement (month-end Operating Cash), a Bills-to-Pay column for
// every Wednesday in the month (bills are paid weekly on Wednesdays), a
// standing Reserves column, and a final Operational Cash =
//   Starting Cash − Σ(weekly bills) − Reserves.

import { PROPERTY_DEFS } from "@/lib/properties/data";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "YYYY-MM" key for a (year, 1–12 month). */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Parse a "YYYY-MM" key back to {year, month}. */
export function parseMonthKey(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** The month immediately before (year, month) — wraps to December of the
 *  prior year. Used to source Starting Cash (prior month-end). */
export function priorMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** ISO dates (YYYY-MM-DD) of every Wednesday in the given month. */
export function wednesdaysInMonth(year: number, month: number): string[] {
  const out: string[] = [];
  const last = new Date(year, month, 0).getDate(); // day 0 of next month = last day
  for (let d = 1; d <= last; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 3) {
      out.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

/** Short label for a Wednesday ISO date, e.g. "Wed 6/11". */
export function wednesdayLabel(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `Wed ${Number(m[1])}/${Number(m[2])}`;
}

export type CashSheetProperty = { code: string; name: string };
export type CashSheetGroup = { id: string; label: string; properties: CashSheetProperty[] };

// Fund groups, in display order. Derived from PROPERTY_DEFS so we never re-key
// the property list. Holding/condo entities (entityKind set), Land, and the
// management entity are excluded — they don't run an operating cash position.
const GROUP_ORDER: { id: string; label: string; match: (p: typeof PROPERTY_DEFS[number]) => boolean }[] = [
  { id: "jv3",   label: "JV III",           match: (p) => p.type === "Office" && p.fundGroup === "JV III" && !p.entityKind },
  { id: "nillc", label: "NI LLC",           match: (p) => p.type === "Office" && p.fundGroup === "NI LLC" && !p.entityKind },
  { id: "sc",    label: "Shopping Centers", match: (p) => p.type === "Retail" },
  { id: "ow",    label: "The Office Works", match: (p) => p.id === "4900" },
  { id: "kh",    label: "Korman Homes",     match: (p) => p.type === "Residential" },
];

/** Operating properties grouped by fund, in display order. */
export function cashSheetGroups(): CashSheetGroup[] {
  return GROUP_ORDER.map((g) => ({
    id: g.id,
    label: g.label,
    properties: PROPERTY_DEFS.filter(g.match).map((p) => ({ code: p.id, name: p.name })),
  })).filter((g) => g.properties.length > 0);
}

/** Flat list of every property code that appears on the Cash Sheet. */
export function cashSheetCodes(): string[] {
  return cashSheetGroups().flatMap((g) => g.properties.map((p) => p.code));
}

/** Per-property manual inputs for one month. */
export type CashSheetRow = {
  /** Standing reserve held back (carries month-to-month until changed). */
  reserves: number;
  /** Bills paid, keyed by Wednesday ISO date. Reset each month. */
  bills: Record<string, number>;
};

/** Net operational cash for a row given its starting cash. Null when starting
 *  cash isn't available yet (prior month's statement not uploaded). */
export function operationalCash(
  startingCash: number | null,
  row: CashSheetRow | undefined,
): number | null {
  if (startingCash == null) return null;
  const bills = row ? Object.values(row.bills).reduce((a, n) => a + (n || 0), 0) : 0;
  const reserves = row?.reserves ?? 0;
  return startingCash - bills - reserves;
}

/** Total of a row's weekly bills. */
export function totalBills(row: CashSheetRow | undefined): number {
  return row ? Object.values(row.bills).reduce((a, n) => a + (n || 0), 0) : 0;
}
