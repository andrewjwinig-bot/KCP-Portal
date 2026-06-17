// Cash Analysis — derive the monthly cash-flow buckets for a property from its
// GL monthly nets, using the ported account→code map. Pure (no server deps).
//
// The GL stores each account's monthly net (a debit-positive activity figure).
// Cash flow flips the sign so receipts (credits) read as positive inflows and
// expenses (debits) as negative outflows — matching the legacy CASH ANALYSIS.

import { ACCOUNT_CODE, PREFIX_CODE, ACCOUNT_EXCLUDED, CASH_FLOW_BUCKETS, type CashFlowCode } from "./accountCodes";

export { CASH_FLOW_BUCKETS };
export type { CashFlowCode };

/** Bucket code for a GL account: exact match, then base-4 prefix fallback.
 *  Returns "excluded" for cash/non-cash accounts, or null when unknown. */
export function bucketCodeFor(account: string): CashFlowCode | "excluded" | null {
  const a = account.trim();
  if (ACCOUNT_CODE[a]) return ACCOUNT_CODE[a];
  if (ACCOUNT_EXCLUDED[a]) return "excluded";
  const p = PREFIX_CODE[a.slice(0, 4)];
  return p ?? null;
}

export type CashFlowResult = {
  /** Signed bucket totals (inflows positive, outflows negative). */
  byBucket: Record<CashFlowCode, number>;
  /** Net change in operating cash for the period = sum of all buckets. */
  netChange: number;
  /** Accounts with activity that carry no code — surfaced for review/tagging. */
  unmapped: { account: string; amount: number }[];
};

const emptyBuckets = (): Record<CashFlowCode, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 });

/** Compute the cash-flow buckets for ONE period (month) from a property's GL
 *  monthly nets. `period` is 1-12; pass `ytdThrough` to sum months 1..period. */
export function computeCashFlow(
  monthly: Record<string, number[]>,
  period: number,
  opts: { ytd?: boolean } = {},
): CashFlowResult {
  const byBucket = emptyBuckets();
  const unmapped: { account: string; amount: number }[] = [];
  for (const [account, nets] of Object.entries(monthly)) {
    const raw = opts.ytd
      ? nets.slice(0, period).reduce((a, n) => a + (n || 0), 0)
      : (nets[period - 1] ?? 0);
    if (!raw) continue;
    const flow = -raw; // flip GL sign → cash-flow sign
    const code = bucketCodeFor(account);
    if (code === "excluded") continue;
    if (code == null) { unmapped.push({ account, amount: flow }); continue; }
    byBucket[code] += flow;
  }
  let netChange = 0;
  for (const b of CASH_FLOW_BUCKETS) netChange += byBucket[b.code];
  unmapped.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { byBucket, netChange, unmapped };
}
