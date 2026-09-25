// NON-REIMBURSABLE UTILITIES ARE THE VACANT SPACE'S (owner). A leased suite's
// utilities are the tenant's, so what the landlord pays on this line is the
// electric, gas and water for the space nobody is leasing — which makes it a
// RATE on vacant square feet, not last year's bill grown 3%:
//
//     month = vacant SF that month × $/SF/yr ÷ 12
//
// A suite is vacant in a month it pays no rent — the same rule occupancy uses —
// so a lease-up assumption starting in June takes that suite off the line from
// June. The rate is typed on the line (stored in the typed-month store under
// `<section>::<label>#@psf`, month 0, in CENTS — the store keeps whole numbers); until it is, it defaults to this year's
// line over today's vacant SF, so the line starts where this year runs.
//
// Pure — the draft passes the rent rows and the typed doc in — so it is tested
// directly.

import type { RentRow } from "./leaseRevenue";
import { lineKey, type LineOverrides } from "./lineOverrides";

/** The sub-key the rate is stored under, beside the line's own typed months. */
export const RATE_ACCOUNT = "@psf";

export const rateKey = (section: string, label: string) => `${lineKey(section, label)}#${RATE_ACCOUNT}`;

/** The one line this applies to: non-reimbursable Utilities (6110/6120/6130-8501). */
export function isVacancyUtilitiesLine(role: string, label: string): boolean {
  return role === "non-reimbursable-expense" && /^\s*utilities\b/i.test(label);
}

/** Each suite once — a suite can appear on more than one rent row. */
function suites(rows: RentRow[]): RentRow[] {
  const seen = new Map<string, RentRow>();
  for (const r of rows) {
    if (!(r.sqft > 0)) continue;
    const k = String(r.unitRef).trim().toUpperCase();
    const hit = seen.get(k);
    if (!hit) { seen.set(k, { ...r, months: r.months.slice() }); continue; }
    hit.months = hit.months.map((v, i) => v + (r.months[i] || 0));
  }
  return [...seen.values()];
}

/** Vacant SF in each month: every suite paying no rent that month. */
export function vacantSfByMonth(rows: RentRow[]): number[] {
  const all = suites(rows);
  return Array.from({ length: 12 }, (_, i) => all.reduce((a, r) => a + ((r.months[i] || 0) > 0.5 ? 0 : r.sqft), 0));
}

/** Vacant SF on today's roll — what this year's utilities were paid on. */
export function vacantSfToday(rows: RentRow[]): number {
  return suites(rows).reduce((a, r) => a + (r.status === "vacant" || r.status === "lease-up" ? r.sqft : 0), 0);
}

/** This year's line over today's vacant SF, to the cent — null with no vacancy. */
export function defaultRate(basisAnnual: number, sfToday: number): number | null {
  if (!(sfToday > 0)) return null;
  return Math.round((basisAnnual / sfToday) * 100) / 100;
}

export function monthsAt(rate: number, sf: number[]): number[] {
  return sf.map((s) => Math.round((s * rate) / 12));
}

export type VacancyUtilities = {
  /** $/SF/yr in use. */
  rate: number;
  rateTyped: boolean;
  /** What the rate defaults to (this year ÷ today's vacant SF). */
  defaultRate: number | null;
  /** Vacant SF by month. */
  sf: number[];
  sfToday: number;
};

/** The rate for the line: typed, else the default. Null when neither exists
 *  (no vacancy today and nothing typed) — the line then keeps its figure. */
export function resolveRate(doc: LineOverrides, section: string, label: string, basisAnnual: number, rows: RentRow[]): VacancyUtilities | null {
  const typed = doc[rateKey(section, label)]?.months?.[0];
  const sfToday = vacantSfToday(rows);
  const def = defaultRate(basisAnnual, sfToday);
  const rate = typed != null ? Number(typed) / 100 : def;
  if (rate == null || !Number.isFinite(rate)) return null;
  return { rate, rateTyped: typed != null, defaultRate: def, sf: vacantSfByMonth(rows), sfToday };
}
