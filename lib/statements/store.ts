// Persistence for tenant monthly statements — one record per statement period,
// each holding every tenant's open account for that month.
//
// A period is the unit of publication: staff import the Skyline export, review
// the tie-outs, then publish, and only then does the portal show it. Importing
// a second export into the same period (the SC and BP runs are separate files)
// merges by unit ref rather than replacing.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { StatementRun, StatementSource, TenantStatement } from "./types";

const store = createCollectionStore<StatementRun>({
  prefix: "tenant-statements",
  keyOf: (r) => r.period,
});

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function getRun(period: string): Promise<StatementRun | null> {
  if (!PERIOD_RE.test(period)) return null;
  return store.get(period);
}

/** Every period, newest first. */
export async function allRuns(): Promise<StatementRun[]> {
  const runs = await store.all();
  return runs.filter((r) => r && PERIOD_RE.test(r.period)).sort((a, b) => b.period.localeCompare(a.period));
}

/** Published periods only, newest first — what a tenant is allowed to see. */
export async function publishedRuns(): Promise<StatementRun[]> {
  return (await allRuns()).filter((r) => r.published);
}

/** Merge one parsed export into its period. Tenants present in the new file
 *  replace their prior copy; tenants only in an earlier file for the same
 *  period are kept (a second building's export doesn't wipe the first).
 *
 *  Order mirrors the laser statement: tenants stay in the sequence Skyline
 *  printed them (which is NOT alphabetical — 1100-34 precedes 1100-12330), a
 *  re-import updates a tenant in place rather than moving them, and a second
 *  export's new tenants append after the first's in their own printed order. */
/** What a merge did — surfaced on the import report so a mid-month correction
 *  is never a silent overwrite. */
export type MergeStats = {
  /** Tenants in the upload that already had a statement — replaced in place. */
  replaced: number;
  /** Tenants in the upload that are new to the month — appended. */
  added: number;
  /** Tenants the upload didn't mention — kept exactly as they were. */
  carriedOver: number;
  /** Replaced tenants whose balance actually moved. */
  changed: number;
  /** Net movement in open balance across those changes. */
  netChange: number;
};

/**
 * Merge an upload into a month's existing statements.
 *
 * The rule for a mid-month re-import: an uploaded tenant REPLACES their prior
 * statement, and a tenant the upload doesn't mention is KEPT, not dropped. A
 * corrected export covering one building must never wipe the rest of the month,
 * and a partial or truncated export must never look like a mass move-out.
 *
 * Pure, so the rule is testable without touching storage. Order is preserved:
 * a replaced tenant stays in their slot rather than jumping to the end, and
 * genuinely-new tenants append in the order the upload printed them.
 */
export function mergeStatements(
  existing: TenantStatement[],
  incoming: TenantStatement[],
): { statements: TenantStatement[]; stats: MergeStats } {
  const prior = new Map(existing.map((s) => [s.unitRef, s]));
  const byUnit = new Map<string, TenantStatement>(prior);

  let replaced = 0, added = 0, changed = 0, netChange = 0;
  const touched = new Set<string>();
  for (const s of incoming) {
    const was = prior.get(s.unitRef);
    if (was) {
      replaced += 1;
      const delta = s.chargeTotal - was.chargeTotal;
      if (Math.abs(delta) >= 0.005) { changed += 1; netChange += delta; }
    } else {
      added += 1;
    }
    touched.add(s.unitRef);
    byUnit.set(s.unitRef, s);
  }

  return {
    statements: [...byUnit.values()],
    stats: {
      replaced, added, changed,
      netChange: Math.round(netChange * 100) / 100,
      carriedOver: existing.filter((s) => !touched.has(s.unitRef)).length,
    },
  };
}

export async function mergeIntoPeriod(
  period: string,
  statements: TenantStatement[],
  source: StatementSource,
): Promise<{ run: StatementRun; stats: MergeStats }> {
  if (!PERIOD_RE.test(period)) throw new Error(`Invalid statement period "${period}".`);
  const now = new Date().toISOString();
  const existing = await store.get(period);

  // Stamp provenance so a carried-over tenant stays identifiable later.
  const stamped = statements.map((s) => ({ ...s, importedAt: source.importedAt, sourceFile: source.filename }));
  const { statements: merged, stats } = mergeStatements(existing?.statements ?? [], stamped);

  const run: StatementRun = {
    period,
    // Re-importing into a published period keeps it published — staff are
    // correcting live data, not un-publishing it from under the tenants.
    published: existing?.published ?? false,
    publishedAt: existing?.publishedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sources: [...(existing?.sources ?? []), source],
    statements: merged,
  };
  await store.set(period, run);
  return { run, stats };
}

export async function setPublished(period: string, published: boolean): Promise<StatementRun | null> {
  const run = await store.get(period);
  if (!run) return null;
  const next: StatementRun = {
    ...run,
    published,
    publishedAt: published ? (run.publishedAt ?? new Date().toISOString()) : null,
    updatedAt: new Date().toISOString(),
  };
  await store.set(period, next);
  return next;
}

export async function deleteRun(period: string): Promise<void> {
  if (!PERIOD_RE.test(period)) return;
  await store.remove(period);
}

/** One tenant's statement for one period. */
export async function statementFor(period: string, unitRef: string): Promise<TenantStatement | null> {
  const run = await getRun(period);
  if (!run) return null;
  const ref = unitRef.trim().toUpperCase();
  return run.statements.find((s) => s.unitRef.toUpperCase() === ref) ?? null;
}

/** Every published period this unit appears in, newest first. */
export async function publishedPeriodsForUnit(unitRef: string): Promise<{ period: string; statement: TenantStatement; asOf: string | null }[]> {
  const ref = unitRef.trim().toUpperCase();
  const out: { period: string; statement: TenantStatement; asOf: string | null }[] = [];
  for (const run of await publishedRuns()) {
    const st = run.statements.find((s) => s.unitRef.toUpperCase() === ref);
    // The statement speaks as of the import THIS tenant came from — a later
    // upload covering other buildings doesn't make their figures newer.
    if (st) out.push({ period: run.period, statement: st, asOf: st.importedAt ?? run.sources[run.sources.length - 1]?.importedAt ?? null });
  }
  return out;
}

/**
 * The publish gate.
 *
 * A month where every tenant reconciles to the balance Skyline printed needs no
 * ceremony — it publishes itself on import. A single tenant that doesn't
 * reconcile holds the WHOLE month back, because a statement we can't tie out is
 * one we shouldn't be asking anyone to pay. Judged on the whole merged month, so
 * a later clean export can't publish over an earlier one's bad tenant.
 *
 * Note what this deliberately does NOT do: it never un-publishes. Re-importing
 * into a live month leaves it live, and any tenant that stops reconciling is
 * flagged "under review" on their own statement instead of retracting everyone
 * else's.
 */
export function shouldAutoPublish(opts: {
  /** Staff preference — the import can opt out of auto-publishing. */
  wants: boolean;
  /** Tenants in the merged month that don't tie out to Skyline. */
  untied: number;
  alreadyPublished: boolean;
}): boolean {
  return opts.wants && opts.untied === 0 && !opts.alreadyPublished;
}
