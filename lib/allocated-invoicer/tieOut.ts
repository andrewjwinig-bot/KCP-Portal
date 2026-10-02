// Allocated-invoicer tie-out: does the split add back up to the source GL?
//
// Every 2000 G&A account is spread across properties by ALLOC_PCT, keyed by the
// account's suffix (9301 = BP share, 9302 = SC share, 9303 = all-property share).
// For each suffix the property shares SHOULD sum to 100%; if they don't (a new
// property added without rebalancing, a fat-finger edit), part of every account
// with that suffix silently never lands on any building — expense that leaks out
// of the invoicing on its way to Avid. This proves the allocation is whole.

import { ALLOC_PCT } from "@/lib/properties/data";
import type { GLParseResult } from "./glParser";

const SUFFIXES = ["9301", "9302", "9303"] as const;
type Suffix = (typeof SUFFIXES)[number];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Σ of every property's share for a suffix — should be 1.0 (100%). */
function pctSumFor(suffix: Suffix): number {
  return Object.values(ALLOC_PCT).reduce((a, p) => a + (p[suffix] ?? 0), 0);
}

export type AllocSuffixTie = {
  suffix: Suffix;
  /** Fraction of every account with this suffix that gets allocated (Σ shares). */
  pctSum: number;
  /** Source $ across all accounts carrying this suffix. */
  sourceAmount: number;
  /** What actually allocates (sourceAmount × pctSum). */
  allocated: number;
  /** sourceAmount − allocated: the leak (or over-allocation, if negative). */
  leak: number;
  ok: boolean;
};

export type AllocationTieOut = {
  sourceTotal: number;
  allocatedTotal: number;
  /** sourceTotal − allocatedTotal: G&A that never lands on a building. */
  unallocated: number;
  bySuffix: AllocSuffixTie[];
  ties: boolean;
};

const TOL_PCT = 0.005; // 0.5% on a suffix's share sum
const TOL_DOLLARS = 1;

export function reconcileAllocation(gl: GLParseResult): AllocationTieOut {
  const pctSum: Record<Suffix, number> = { "9301": pctSumFor("9301"), "9302": pctSumFor("9302"), "9303": pctSumFor("9303") };
  const bySuffixSource: Record<Suffix, number> = { "9301": 0, "9302": 0, "9303": 0 };

  let sourceTotal = 0;
  for (const acc of gl.accountTotals.values()) {
    const net = acc.netTotal || 0;
    sourceTotal += net;
    bySuffixSource[acc.accountSuffix] += net;
  }

  let allocatedTotal = 0;
  const bySuffix: AllocSuffixTie[] = [];
  for (const s of SUFFIXES) {
    const src = bySuffixSource[s];
    if (src === 0) continue; // suffix not present in this GL
    const allocated = src * pctSum[s];
    allocatedTotal += allocated;
    bySuffix.push({
      suffix: s,
      pctSum: Math.round(pctSum[s] * 10000) / 10000,
      sourceAmount: r2(src),
      allocated: r2(allocated),
      leak: r2(src - allocated),
      ok: Math.abs(pctSum[s] - 1) < TOL_PCT,
    });
  }

  const unallocated = sourceTotal - allocatedTotal;
  return {
    sourceTotal: r2(sourceTotal),
    allocatedTotal: r2(allocatedTotal),
    unallocated: r2(unallocated),
    bySuffix,
    ties: Math.abs(unallocated) < TOL_DOLLARS,
  };
}
