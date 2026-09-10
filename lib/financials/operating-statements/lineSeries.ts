// Per-statement-line month-over-month series, derived from the merged GL
// monthly nets + the line's account mask. Shared by the statement view (the
// "?" investigate marker) and auto-explain.

import { accountMatchesMask } from "./mask";

const r0 = (v: number) => Math.round(v);

/** A line's amount for each month 1..upto (sign flips revenue to positive). */
export function lineMonthly(monthly: Record<string, number[]>, mask: string, sign: number, upto: number): number[] {
  const out = new Array(upto).fill(0);
  for (const [acct, nets] of Object.entries(monthly)) {
    if (!accountMatchesMask(mask, acct)) continue;
    for (let m = 0; m < upto; m++) out[m] += (nets[m] ?? 0) * sign;
  }
  return out.map(r0);
}

/** A line's transaction count for each month 1..upto. */
export function lineTxnCounts(txByAccount: Record<string, { month: number }[]>, mask: string, upto: number): number[] {
  const out = new Array(upto).fill(0);
  for (const [acct, txns] of Object.entries(txByAccount)) {
    if (!accountMatchesMask(mask, acct)) continue;
    for (const t of txns) if (t.month >= 1 && t.month <= upto) out[t.month - 1]++;
  }
  return out;
}
