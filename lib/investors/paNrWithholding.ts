// PA NONRESIDENT WITHHOLDING ON A DISTRIBUTION (owner: "add these PA NR WH tax
// calculators to the respective properties so we know how much to withhold
// when making distributions"). Rebuilt from the owner's "2026 Distribution PA
// NR WH" workbooks — one per partnership — so the figures here are the
// workbook's to the cent.
//
// The partnership pays Pennsylvania nonresident tax on certain partners'
// behalf (the prior year's return, and the current year's quarterly
// estimates). Those payments are recovered out of the partner's next
// distribution. Per partner:
//
//   Gross distribution = ownership % × the total distribution
//   PA NR %            = the partner's prior-year payment ÷ every partner's
//   Withholding        = prior-year payment + current-year estimate
//   Net cash           = gross − withholding
//
// Pure and client-safe: the page, the API and the Excel export all call
// `computeWithholding`, so the screen and the workbook cannot disagree.

import type { PropertyOwner } from "../properties/ownership";

/** One partner's tax paid on their behalf. Dollars, to the cent. */
export type PartnerTax = { paid: number; estimate: number };

/** A property's calculator for one distribution year. */
export type WithholdingDoc = {
  /** The total distribution being paid out. */
  distribution: number;
  /** Keyed by owner id (`PROPERTY_OWNERSHIP`). A partner not listed owes nothing. */
  partners: Record<string, PartnerTax>;
  updatedBy?: string;
  updatedAt?: string;
};

/** The distribution year each seed belongs to: "2025 payment + 2026 estimate". */
export const SEED_YEAR = 2026;

/**
 * The owner's workbooks, as of 11/2026. Payments "paid 4/15/26 confirmed via
 * mypath". Revere's 2026 estimate was keyed as a $2,000 total split by each
 * partner's share of the 2025 payments — stored here as that split, to the
 * cent, so it can be edited per partner like Elbridge's.
 *
 * REVERE: Brendan K. Isard's interest was redeemed in 10/2026, so he is not on
 * the roster and takes no distribution — his $285 (2025) + $285.86 (2026
 * estimate) are NOT recovered here. The other partners' gross distributions
 * use the post-redemption percentages in `ownership.ts`, not the workbook's
 * 18.74 / 37.48 / 3.13%.
 */
export const WITHHOLDING_SEEDS: Record<string, WithholdingDoc> = {
  "7200": {
    distribution: 150000,
    partners: {
      "k1-7200-hahn-1": { paid: 19, estimate: 19 },
      "k1-7200-lkorman": { paid: 223, estimate: 223 },
      "k1-7200-bkorman": { paid: 223, estimate: 223 },
      "k1-7200-mkorman": { paid: 223, estimate: 223 },
      "k1-7200-jhonickman-2": { paid: 223, estimate: 223 },
      "k1-7200-hahn-2": { paid: 223, estimate: 223 },
      "k1-7200-sohn": { paid: 1271, estimate: 1271 },
      "k1-7200-bkorman-tua": { paid: 77, estimate: 77 },
      "k1-7200-afeldman-lik": { paid: 26, estimate: 26 },
      "k1-7200-altman-lik": { paid: 26, estimate: 26 },
      "k1-7200-schurr-lik": { paid: 26, estimate: 26 },
    },
  },
  "7300": {
    distribution: 300000,
    partners: {
      "k1-7300-aisard": { paid: 284, estimate: 284.85 },
      "k1-7300-misard": { paid: 285, estimate: 285.86 },
      "k1-7300-lisard": { paid: 570, estimate: 571.72 },
      "k1-7300-cisard": { paid: 570, estimate: 571.72 },
    },
  },
};

/** Properties that carry a calculator. Add a seed to add a property. */
export const hasWithholding = (code: string) => Object.prototype.hasOwnProperty.call(WITHHOLDING_SEEDS, code.toUpperCase());

/** The doc a year starts from: the seed in its own year; any other year keeps
 *  the distribution and starts every partner at $0 (new payments to key). */
export function startingDoc(code: string, year: number): WithholdingDoc {
  const seed = WITHHOLDING_SEEDS[code.toUpperCase()];
  if (!seed) return { distribution: 0, partners: {} };
  if (year === SEED_YEAR) return { distribution: seed.distribution, partners: { ...seed.partners } };
  return { distribution: seed.distribution, partners: {} };
}

export type WithholdingRow = {
  id: string;
  name: string;
  heldAs: string | null;
  state: string | null;
  pct: number;
  nrPct: number;
  paid: number;
  estimate: number;
  gross: number;
  withholding: number;
  net: number;
};

export type WithholdingResult = {
  distribution: number;
  rows: WithholdingRow[];
  totals: { pct: number; paid: number; estimate: number; gross: number; withholding: number; net: number };
  /** Partners whose withholding is more than their distribution. */
  short: string[];
  /** Ids in the doc that are no longer on the roster (a redeemed partner). */
  orphaned: string[];
};

const cents = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function computeWithholding(owners: PropertyOwner[], doc: WithholdingDoc): WithholdingResult {
  const distribution = num(doc.distribution);
  const tax = (id: string) => doc.partners?.[id] ?? { paid: 0, estimate: 0 };
  const totalPaid = owners.reduce((t, o) => t + num(tax(o.id).paid), 0);
  const rows = owners.map((o): WithholdingRow => {
    const pct = num(o.profitPct ?? o.ownerPct);
    const paid = num(tax(o.id).paid), estimate = num(tax(o.id).estimate);
    const gross = pct * distribution;
    const withholding = paid + estimate;
    return {
      id: o.id, name: o.name, heldAs: o.detailedName ?? null, state: o.state ?? null,
      pct, nrPct: totalPaid ? paid / totalPaid : 0, paid, estimate,
      gross: cents(gross), withholding: cents(withholding), net: cents(gross - withholding),
    };
  });
  const sum = (f: (r: WithholdingRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const ids = new Set(owners.map((o) => o.id));
  return {
    distribution,
    rows,
    totals: {
      pct: sum((r) => r.pct), paid: cents(sum((r) => r.paid)), estimate: cents(sum((r) => r.estimate)),
      gross: cents(sum((r) => r.gross)), withholding: cents(sum((r) => r.withholding)), net: cents(sum((r) => r.net)),
    },
    short: rows.filter((r) => r.withholding > r.gross + 0.005).map((r) => r.id),
    orphaned: Object.keys(doc.partners ?? {}).filter((id) => !ids.has(id) && (num(doc.partners[id].paid) || num(doc.partners[id].estimate))),
  };
}

/** Cleans a client-supplied doc down to the fields above, for known owners only. */
export function sanitizeDoc(body: unknown, owners: PropertyOwner[]): WithholdingDoc {
  const b = (body ?? {}) as Record<string, any>;
  const ids = new Set(owners.map((o) => o.id));
  const partners: Record<string, PartnerTax> = {};
  for (const [id, v] of Object.entries((b.partners ?? {}) as Record<string, any>)) {
    if (!ids.has(id)) continue;
    const paid = cents(Math.max(0, Number(v?.paid) || 0)), estimate = cents(Math.max(0, Number(v?.estimate) || 0));
    if (paid || estimate) partners[id] = { paid, estimate };
  }
  return { distribution: cents(Math.max(0, Number(b.distribution) || 0)), partners };
}
