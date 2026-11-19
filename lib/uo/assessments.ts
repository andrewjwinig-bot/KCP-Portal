// THE CITY'S ASSESSED VALUES, EVERY YEAR, WITHOUT ANYONE KEYING THEM (owner,
// 11/2026: "it should know to update in perpetuity not just for one year").
//
// Line 1 of every U&O return is the parcel's assessed value for the calendar
// year × 1.21% ÷ 12, and Philadelphia reassesses every year. The OPA certifies
// next year's values in the spring and publishes them on the City's open data
// (`assessments` on phl.carto.com). The U&O cron reads them once a week
// (`assessmentsLoad.ts`), keeps every year it finds, and emails Drew when a
// new year arrives or a value moves — so January switches to the new figure
// on its own, this year and every year after.
//
// Which value a return uses, in order (`resolveAssessed`):
//   1. typed on the page — the value on the City's own form, where it differs
//   2. the budget's assessments (`ASSESSED_TAXES`) for that exact year — the
//      figures the filed returns were checked against
//   3. the City's open data for that exact year
//   4. the latest year known before it, with a warning that the City has not
//      certified the year yet
// Where the open data now disagrees with (2) — an appeal, a correction — the
// page says so rather than quietly moving a year already being filed.
//
// Pure: no storage, no fetch.

import { ASSESSED_TAXES } from "@/lib/financials/budgets/assessedTaxes";
import { UO_PROPERTIES, UO_RATE } from "./config";

/** "<parcel>:<year>" → the City's certified assessed value. */
export type CityValues = Record<string, number>;

export type CityAssessments = {
  values: CityValues;
  /** "<parcel>:<year>" → when the value was first read (or last changed). */
  seenAt: Record<string, string>;
  checkedAt?: string;
  /** The last check that failed, and why — shown on the page. */
  error?: string;
};

export const emptyCityAssessments = (): CityAssessments => ({ values: {}, seenAt: {} });

export type AssessedValue = {
  value: number;
  source: string;
  /** Read from an earlier year because nothing is known for this one. */
  stale?: boolean;
  /** The year the value was taken from, where it is not the one asked for. */
  fromYear?: number;
  /** The open data reads differently for the year (shown as a warning). */
  cityDiffers?: number;
};

/** The budget's value for a parcel in exactly `year`, if it carries one. */
export function seededValue(parcel: string, year: number): number | null {
  for (const a of ASSESSED_TAXES) {
    const p = a.parcels.find((x) => x.number === parcel);
    if (!p) continue;
    if (year === a.year && p.assessed != null) return p.assessed;
    if (year === a.year - 1 && p.prior != null) return p.prior;
  }
  return null;
}

/** Every year a value is known for the parcel: seed and open data. */
function knownYears(parcel: string, city: CityValues): Map<number, { value: number; from: "seed" | "city" }> {
  const out = new Map<number, { value: number; from: "seed" | "city" }>();
  for (const [k, v] of Object.entries(city)) {
    const [p, y] = k.split(":");
    if (p === parcel && v > 0) out.set(Number(y), { value: v, from: "city" });
  }
  for (const a of ASSESSED_TAXES) {
    const p = a.parcels.find((x) => x.number === parcel);
    if (!p) continue;
    if (p.prior != null) out.set(a.year - 1, { value: p.prior, from: "seed" });
    if (p.assessed != null) out.set(a.year, { value: p.assessed, from: "seed" });
  }
  return out;
}

export function resolveAssessed(parcel: string, year: number, typed: Record<string, number>, city: CityValues): AssessedValue | null {
  const key = `${parcel}:${year}`;
  if (typed[key] > 0) return { value: typed[key], source: "As on the City's form (typed)" };
  const cityV = city[key] > 0 ? city[key] : null;
  const seed = seededValue(parcel, year);
  if (seed != null) {
    return { value: seed, source: `City's certified ${year} assessment`, ...(cityV != null && cityV !== seed ? { cityDiffers: cityV } : {}) };
  }
  if (cityV != null) return { value: cityV, source: `City's certified ${year} assessment (open data)` };
  const before = [...knownYears(parcel, city).entries()].filter(([y]) => y < year).sort((a, b) => b[0] - a[0])[0];
  if (before) return { value: before[1].value, source: `City's ${before[0]} assessment — ${year} not certified yet`, stale: true, fromYear: before[0] };
  const after = [...knownYears(parcel, city).entries()].sort((a, b) => a[0] - b[0])[0];
  return after ? { value: after[1].value, source: `City's ${after[0]} assessment (closest known)`, stale: true, fromYear: after[0] } : null;
}

/** Every parcel the U&O returns file on. */
export const uoParcels = (): string[] => [...new Set(UO_PROPERTIES.flatMap((p) => p.accounts.map((a) => a.parcel)))];

/** The years worth asking the City for: last year through two years out. */
export const yearsToCheck = (today: string): number[] => {
  const y = Number(today.slice(0, 4));
  return [y - 1, y, y + 1, y + 2];
};

/** The open-data query (market value is the assessed value U&O is figured on). */
export function cityQuery(parcels: string[], years: number[]): string {
  return `SELECT parcel_number, year, market_value FROM assessments WHERE parcel_number IN (${parcels.map((p) => `'${p.replace(/\D/g, "")}'`).join(",")}) AND year IN (${years.map((y) => `'${Math.trunc(y)}'`).join(",")}) ORDER BY parcel_number, year`;
}

export function parseCityRows(rows: unknown): CityValues {
  const out: CityValues = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const p = String((r as any)?.parcel_number ?? "").trim();
    const y = Number((r as any)?.year);
    const v = Number((r as any)?.market_value);
    if (/^\d{9}$/.test(p) && y > 2000 && v > 0) out[`${p}:${y}`] = Math.round(v);
  }
  return out;
}

export type AssessmentChange = {
  parcel: string;
  year: number;
  /** null = a year the portal did not know before. */
  before: number | null;
  after: number;
  /** Line 1 a month, before → after (against the year before for a new year). */
  lineBefore: number | null;
  lineAfter: number;
};

export const lineOne = (assessed: number) => Math.round((assessed * UO_RATE) / 12);

/** What the newest read changed. A new year is compared with the year before
 *  it (what January will move from); a changed value with what it was. */
export function assessmentChanges(prev: CityValues, next: CityValues): AssessmentChange[] {
  const out: AssessmentChange[] = [];
  for (const [k, after] of Object.entries(next)) {
    const before = prev[k] ?? null;
    if (before === after) continue;
    const [parcel, y] = k.split(":");
    const year = Number(y);
    const base = before ?? next[`${parcel}:${year - 1}`] ?? prev[`${parcel}:${year - 1}`] ?? seededValue(parcel, year - 1);
    out.push({ parcel, year, before, after, lineBefore: base != null ? lineOne(base) : null, lineAfter: lineOne(after) });
  }
  return out.sort((a, b) => a.year - b.year || a.parcel.localeCompare(b.parcel));
}

/** Lay a new read over the stored one. The open data never forgets a year, but
 *  a failed or partial read must not wipe what was known. */
export function mergeCity(prev: CityAssessments, read: CityValues, at: string): CityAssessments {
  const values = { ...prev.values };
  const seenAt = { ...prev.seenAt };
  for (const [k, v] of Object.entries(read)) {
    if (values[k] !== v) seenAt[k] = at;
    values[k] = v;
  }
  return { values, seenAt, checkedAt: at };
}
