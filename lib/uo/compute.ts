// The U&O return, computed (pure). The City's UO1, line for line, from the
// assessed value and the rent roll — so the figures to key on the City's site
// are on the page, and each tenant's monthly U&O charge is the same split.
//
//   A  assessed value                      (the City's, per OPA parcel)
//   1  maximum tax  = A × 1.21% ÷ 12       (whole dollars, as the City rounds)
//   2  vacant       = the vacant suites' shares
//   3  exempt       = exempt tenants' shares + common area
//   6  = 2 + 3 (+ 4 residential, 5 KOZ — never ours)
//   7  tax due      = 1 − 6
//   8  delinquent   = the shares of tenants reported on the UO3
//   9  due before discount = 7 − 8
//  10  discount     = 1% of 9 when paid by the 25th
//  11  net tax due  = 9 − 10
//
// Each suite's share is Line 1 × its SF ÷ every SF on the allocation (the
// roll's suites, vacant ones included, plus any common area the roll omits),
// rounded to the dollar suite by suite — as the calculation sheets and the
// tenants' monthly charges round it. Line 7 is Line 1 less the vacant and
// exempt shares, so a dollar of rounding stays in the tax due, as on the
// City's form.

import { UO_DISCOUNT_PCT, UO_JE, UO_RATE, type UoAccount, type UoCommonArea } from "./config";

export type UoUnitIn = { unitRef: string; tenant: string; sqft: number; vacant: boolean; amenity?: boolean };

export type UoRowStatus = "taxable" | "vacant" | "exempt" | "delinquent" | "common";
export type UoRow = {
  unitRef: string | null;
  tenant: string;
  sqft: number;
  /** The suite's monthly U&O — its share of Line 1. */
  share: number;
  status: UoRowStatus;
  /** Why exempt, in words. */
  reason?: string;
};

export type UoLines = {
  assessed: number;
  maxTax: number;      // 1
  vacant: number;      // 2
  exempt: number;      // 3
  totalOff: number;    // 6
  taxDue: number;      // 7
  delinquent: number;  // 8
  beforeDiscount: number; // 9
  discount: number;    // 10
  net: number;         // 11
};

export type UoReturn = {
  account: UoAccount;
  lines: UoLines;
  rows: UoRow[];
  basisSf: number;
};

export const maxTaxOf = (assessed: number) => Math.round((assessed * UO_RATE) / 12);

/** Split `total` over weights, whole dollars, adding to `total` exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]] += 1;
  return out;
}

export function computeReturn(input: {
  account: UoAccount;
  assessed: number;
  units: UoUnitIn[];
  commonAreas?: UoCommonArea[];
  /** unitRef → why the City does not tax them. */
  exempt: Map<string, string>;
  delinquent: Set<string>;
  /** Take the 1% (filed and paid by the 25th). */
  discount: boolean;
}): UoReturn {
  const maxTax = maxTaxOf(input.assessed);
  const base = (rows: UoRow[], basisSf: number): UoReturn => {
    const sum = (s: UoRowStatus) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.share, 0);
    const vacant = input.account.noTenants ? maxTax : sum("vacant");
    const exempt = sum("exempt") + sum("common");
    const totalOff = vacant + exempt;
    const taxDue = maxTax - totalOff;
    const delinquent = sum("delinquent");
    const beforeDiscount = taxDue - delinquent;
    const discount = input.discount ? Math.round((beforeDiscount * UO_DISCOUNT_PCT) / 100) : 0;
    return {
      account: input.account, basisSf, rows,
      lines: { assessed: input.assessed, maxTax, vacant, exempt, totalOff, taxDue, delinquent, beforeDiscount, discount, net: beforeDiscount - discount },
    };
  };
  if (input.account.noTenants) return base([], 0);

  const suites = input.units.filter((u) => u.sqft > 0);
  const common = (input.commonAreas ?? []).filter((c) => c.sqft > 0);
  const weights = [...suites.map((u) => u.sqft), ...common.map((c) => c.sqft)];
  const basis = weights.reduce((t, w) => t + w, 0);
  const shares = weights.map((w) => (basis > 0 ? Math.round((maxTax * w) / basis) : 0));
  const rows: UoRow[] = suites.map((u, i) => {
    const ref = u.unitRef.toUpperCase();
    const reason = input.exempt.get(ref);
    const status: UoRowStatus = u.amenity ? "common" : u.vacant ? "vacant" : reason ? "exempt" : input.delinquent.has(ref) ? "delinquent" : "taxable";
    return { unitRef: u.unitRef, tenant: u.tenant, sqft: u.sqft, share: shares[i], status, ...(status === "exempt" ? { reason } : status === "common" ? { reason: "Common area" } : {}) };
  });
  common.forEach((c, j) => rows.push({ unitRef: null, tenant: c.label, sqft: c.sqft, share: shares[suites.length + j], status: "common", reason: "Common area" }));
  return base(rows, basis);
}

/** Add the returns of one property (4500 files two). */
export function sumLines(returns: UoReturn[]): UoLines {
  const z: UoLines = { assessed: 0, maxTax: 0, vacant: 0, exempt: 0, totalOff: 0, taxDue: 0, delinquent: 0, beforeDiscount: 0, discount: 0, net: 0 };
  for (const r of returns) for (const k of Object.keys(z) as (keyof UoLines)[]) z[k] += r.lines[k];
  return z;
}

export type UoJeLine = { property: string; account: string; date: string; description: string; reference: string; amount: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The payment JE for each property, as the team's import carries it:
 *  2430 the U&O before the discount (+), 0110 paid (−), 9190 the discount (−).
 *  Nets to zero per property; a zero line is left out (Skyline refuses one). */
export function journalLines(month: string, byProperty: { code: string; lines: UoLines }[]): UoJeLine[] {
  const [y, m] = month.split("-").map(Number);
  const date = `${m}/25/${y}`;
  const description = `${MONTHS[m - 1]} PHL U&O Pmt`;
  const reference = `U&O${m}`;
  const out: UoJeLine[] = [];
  for (const p of byProperty) {
    const l = p.lines;
    const rows: [string, number][] = [[UO_JE.cash, -l.net], [UO_JE.payable, l.beforeDiscount], [UO_JE.discount, -l.discount]];
    for (const [account, amount] of rows) if (Math.round(amount) !== 0) out.push({ property: p.code, account, date, description, reference, amount: Math.round(amount) });
  }
  return out;
}
