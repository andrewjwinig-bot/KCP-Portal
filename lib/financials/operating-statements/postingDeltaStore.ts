// Interim posting-report deltas layered on top of the full GL uploads.
//
// A posting report is an incremental journal feed between full GL uploads. Each
// stored delta carries one property/year's per-account, per-month net changes
// (debit − credit — the same sign convention the GLs use) plus the underlying
// transactions. Deltas are applied ONLY to months a full GL upload doesn't
// already cover ("full GL wins"): the full upload is the authoritative baseline
// for the months it spans, and posting reports fill the tail until the next
// upload (a December full-year GL then supersedes every delta it now covers).
//
// Idempotent by content id: re-importing the same posting report overwrites the
// same record rather than double-counting.

import { createCollectionStore } from "@/lib/collectionStore";
import type { GlTransaction } from "./glParser";
import type { StoredGl } from "./statementStore";

export type PostingDelta = {
  /** Deterministic content hash — re-importing the same report overwrites. */
  id: string;
  /** Resolved mapping key (property/fund) — matches StoredGl.key. */
  key: string;
  year: number;
  importedAt: string;
  importedBy?: string;
  /** "Post Thru" date from the report header, if any. */
  postThru: string | null;
  sourceName: string;
  /** account → 12 monthly nets (debit − credit). */
  monthly: Record<string, number[]>;
  /** account → transactions (each carrying its reporting month 1–12). */
  transactions: Record<string, GlTransaction[]>;
  /** Distinct months (1–12) this delta touches. */
  months: number[];
};

const store = createCollectionStore<PostingDelta>({ prefix: "posting-deltas", keyOf: (d) => d.id });

export async function savePostingDelta(rec: PostingDelta): Promise<void> {
  await store.set(rec.id, rec);
}
export async function listPostingDeltas(): Promise<PostingDelta[]> {
  return store.all();
}
export async function postingDeltasFor(key: string, year: number): Promise<PostingDelta[]> {
  return (await store.all()).filter((d) => d.key === key && d.year === year);
}
export async function deletePostingDelta(id: string): Promise<void> {
  await store.remove(id);
}

/** The month a full GL upload has ACTUALS through (1–12); 0 = no full GL.
 *  Uses `maxPeriodInFile` (the last contiguous ACTIVE month) — NOT `coverageEnd`
 *  (the report's "To" date). A year-to-date GL exported early (say a Jan–Dec
 *  range with only Jan–Feb posted) has coverageEnd=12 but actuals only through
 *  Feb; keying off coverageEnd would suppress every interim posting report for
 *  Mar–Dec. Deltas fill the months the full GL hasn't actually posted. */
function fullCoverage(base: StoredGl | null): number {
  if (!base) return 0;
  return base.maxPeriodInFile ?? base.coverageEnd ?? 0;
}

/** Signature for de-duplicating a posted line across overlapping reports. Only
 *  used when the line carries a ref (voucher/check no.) — a strong unique key.
 *  Without a ref we don't dedup, so a genuinely distinct ref-less entry is never
 *  dropped. */
function txnSig(acct: string, t: GlTransaction): string | null {
  const ref = (t.ref ?? "").trim();
  if (!ref) return null;
  return `${acct}|${t.date}|${ref}|${t.amount}`;
}

/**
 * Add posting-report deltas to an assembled full-GL result, but only for months
 * the full GL doesn't already have actuals for ("full GL wins"). Posting reports
 * are run receipts, so distinct runs are summed — but the SAME posted line
 * appearing in two overlapping reports (a re-export with a later Post-Thru) is
 * de-duplicated by its ref so it isn't double-counted. Pure. `base` may be null
 * (no full GL yet) — then every delta month applies from a zero baseline.
 * Returns null only when there's nothing at all (no base and no deltas).
 */
export function applyPostingDeltas(base: StoredGl | null, deltas: PostingDelta[], key: string, year: number): StoredGl | null {
  if (!deltas.length) return base;
  const covered = fullCoverage(base);

  const monthly: Record<string, number[]> = {};
  if (base) for (const [a, nets] of Object.entries(base.monthly)) monthly[a] = [...nets];

  // Oldest → newest, so the first occurrence of a ref wins (later re-exports of
  // the same line are the dupes).
  const ordered = [...deltas].sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1));
  const seen = new Set<string>();
  let appliedMax = 0;
  const bump = (acct: string, month: number, v: number) => {
    if (month <= covered || !v) return;
    (monthly[acct] ??= new Array(12).fill(0))[month - 1] += v;
    if (month > appliedMax) appliedMax = month;
  };
  for (const d of ordered) {
    const hasTxns = Object.keys(d.transactions).length > 0;
    if (hasTxns) {
      // Rebuild from transactions so overlapping refs can be de-duplicated.
      for (const [acct, txs] of Object.entries(d.transactions)) {
        for (const t of txs) {
          const sig = txnSig(acct, t);
          if (sig) { if (seen.has(sig)) continue; seen.add(sig); }
          bump(acct, t.month, t.amount);
        }
      }
    } else {
      // Legacy delta with no stored transactions → fall back to summing monthly.
      for (const [acct, nets] of Object.entries(d.monthly)) {
        for (let m = covered + 1; m <= 12; m++) bump(acct, m, nets[m - 1] ?? 0);
      }
    }
  }

  if (appliedMax === 0) return base; // every delta month already covered

  if (base) {
    return {
      ...base,
      monthly,
      maxPeriodInFile: Math.max(base.maxPeriodInFile || 0, appliedMax),
      coverageEnd: Math.max(base.coverageEnd ?? base.maxPeriodInFile ?? 0, appliedMax),
    };
  }
  // No full GL: synthesize a minimal StoredGl from the deltas alone.
  const firstActive = Math.min(...Object.values(monthly).flatMap((nets) => nets.map((v, i) => (Math.abs(v) > 0.005 ? i + 1 : 13))));
  return {
    id: `posting-${key}-${year}`,
    key, propertyCode: key, year,
    uploadedAt: deltas.map((d) => d.importedAt).sort().slice(-1)[0] ?? new Date(0).toISOString(),
    fileName: "(posting reports)",
    maxPeriodInFile: appliedMax,
    monthly,
    coverageStartMonth: Number.isFinite(firstActive) ? firstActive : 1,
    coverageEnd: appliedMax,
    transactionsStored: true,
  };
}

/** Merge posting-report transactions for months a full GL doesn't cover, so the
 *  line-item drill-down shows interim activity. `coveredThrough` is the full
 *  GL's authoritative month (0 if none). */
export function applyPostingTransactions(
  base: Record<string, GlTransaction[]>,
  deltas: PostingDelta[],
  coveredThrough: number,
): Record<string, GlTransaction[]> {
  if (!deltas.length) return base;
  const out: Record<string, GlTransaction[]> = {};
  for (const [a, txs] of Object.entries(base)) out[a] = [...txs];
  const ordered = [...deltas].sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1));
  const seen = new Set<string>();
  for (const d of ordered) {
    for (const [acct, txs] of Object.entries(d.transactions)) {
      for (const t of txs) {
        if (t.month <= coveredThrough) continue;
        const sig = txnSig(acct, t);
        if (sig) { if (seen.has(sig)) continue; seen.add(sig); }
        (out[acct] ??= []).push(t);
      }
    }
  }
  return out;
}
