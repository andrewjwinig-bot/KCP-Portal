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
export async function mergeIntoPeriod(
  period: string,
  statements: TenantStatement[],
  source: StatementSource,
): Promise<StatementRun> {
  if (!PERIOD_RE.test(period)) throw new Error(`Invalid statement period "${period}".`);
  const now = new Date().toISOString();
  const existing = await store.get(period);

  // Map preserves insertion order: seed with the period's existing sequence,
  // then overwrite matches in place and append only genuinely-new tenants.
  const byUnit = new Map<string, TenantStatement>();
  for (const s of existing?.statements ?? []) byUnit.set(s.unitRef, s);
  for (const s of statements) byUnit.set(s.unitRef, s);

  const run: StatementRun = {
    period,
    // Re-importing into a published period keeps it published — staff are
    // correcting live data, not un-publishing it from under the tenants.
    published: existing?.published ?? false,
    publishedAt: existing?.publishedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sources: [...(existing?.sources ?? []), source],
    statements: [...byUnit.values()],
  };
  await store.set(period, run);
  return run;
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
export async function publishedPeriodsForUnit(unitRef: string): Promise<{ period: string; statement: TenantStatement }[]> {
  const ref = unitRef.trim().toUpperCase();
  const out: { period: string; statement: TenantStatement }[] = [];
  for (const run of await publishedRuns()) {
    const st = run.statements.find((s) => s.unitRef.toUpperCase() === ref);
    if (st) out.push({ period: run.period, statement: st });
  }
  return out;
}
