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

/** The month a full GL upload is authoritative through (1–12); 0 = no full GL. */
function fullCoverage(base: StoredGl | null): number {
  if (!base) return 0;
  return base.coverageEnd ?? base.maxPeriodInFile ?? 0;
}

/**
 * Add posting-report deltas to an assembled full-GL result, but only for months
 * the full GL doesn't already cover ("full GL wins"). Pure. `base` may be null
 * (no full GL yet) — then every delta month applies from a zero baseline.
 * Returns null only when there's nothing at all (no base and no deltas).
 */
export function applyPostingDeltas(base: StoredGl | null, deltas: PostingDelta[], key: string, year: number): StoredGl | null {
  if (!deltas.length) return base;
  const covered = fullCoverage(base);

  const monthly: Record<string, number[]> = {};
  if (base) for (const [a, nets] of Object.entries(base.monthly)) monthly[a] = [...nets];

  let appliedMax = 0;
  for (const d of deltas) {
    for (const [acct, nets] of Object.entries(d.monthly)) {
      for (let m = covered + 1; m <= 12; m++) {
        const v = nets[m - 1] ?? 0;
        if (!v) continue;
        (monthly[acct] ??= new Array(12).fill(0))[m - 1] += v;
        if (m > appliedMax) appliedMax = m;
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
  for (const d of deltas) {
    for (const [acct, txs] of Object.entries(d.transactions)) {
      const keep = txs.filter((t) => t.month > coveredThrough);
      if (keep.length) (out[acct] ??= []).push(...keep);
    }
  }
  return out;
}
