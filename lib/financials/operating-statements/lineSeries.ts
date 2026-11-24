// Per-statement-line month-over-month series, derived from the merged GL
// monthly nets + the line's account mask. Shared by the statement view (the
// "?" investigate marker) and auto-explain.

import { accountMatchesMask, claimMapping } from "./mask";

type MaskMapping = { sections: { name: string; lines: { label: string; mask: string }[] }[] };
const ownedCache = new WeakMap<object, WeakMap<object, Map<string, Set<string>>>>();

/** The accounts a statement line OWNS in a set of monthly nets — claimed
 *  across the whole mapping, exactly as the statement totals them
 *  (`claimMapping`). A raw mask match is not that: G&A's "8*-*" also matches
 *  Business Taxes and Legal & Accounting, so the "?" was judged — and the
 *  drill-down listed — a different figure than the line shows. */
export function lineOwnedAccounts(mapping: MaskMapping, monthly: Record<string, unknown>, section: string, label: string): Set<string> {
  let byMonthly = ownedCache.get(mapping);
  if (!byMonthly) ownedCache.set(mapping, (byMonthly = new WeakMap()));
  let owned = byMonthly.get(monthly);
  if (!owned) {
    owned = new Map();
    const claims = claimMapping(mapping.sections.map((s) => s.lines.map((l) => l.mask)), Object.keys(monthly));
    mapping.sections.forEach((s, si) => s.lines.forEach((l, li) => {
      const k = `${s.name}::${l.label}`;
      if (!owned!.has(k)) owned!.set(k, new Set(claims[si][li]));
    }));
    byMonthly.set(monthly, owned);
  }
  return owned.get(`${section}::${label}`) ?? new Set();
}

const r0 = (v: number) => Math.round(v);

/** A line's amount for each month 1..upto (sign flips revenue to positive). */
export function lineMonthly(monthly: Record<string, number[]>, mask: string, sign: number, upto: number, owned?: Set<string>): number[] {
  const out = new Array(upto).fill(0);
  for (const [acct, nets] of Object.entries(monthly)) {
    if (owned ? !owned.has(acct) : !accountMatchesMask(mask, acct)) continue;
    for (let m = 0; m < upto; m++) out[m] += (nets[m] ?? 0) * sign;
  }
  return out.map(r0);
}

/** A line's transaction count for each month 1..upto. */
export function lineTxnCounts(txByAccount: Record<string, { month: number }[]>, mask: string, upto: number, owned?: Set<string>): number[] {
  const out = new Array(upto).fill(0);
  for (const [acct, txns] of Object.entries(txByAccount)) {
    if (owned ? !owned.has(acct) : !accountMatchesMask(mask, acct)) continue;
    for (const t of txns) if (t.month >= 1 && t.month <= upto) out[t.month - 1]++;
  }
  return out;
}
