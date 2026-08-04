// Allocated Expense Invoicer — run log. Records each allocation run (the GL
// period invoiced + when it was generated) so staff can see where to pick up.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "allocated-invoicer-runs";
const ID = "log";

export type AllocationRun = {
  /** GL period text, e.g. "May 1, 2026 - May 31, 2026". */
  periodText: string;
  /** Period end (ISO YYYY-MM-DD) — the through-date invoiced. */
  periodEndDate: string;
  /** Statement month label, e.g. "May 2026". */
  statementMonth: string;
  /** When the run was generated (ISO timestamp). */
  ranAt: string;
  /** Who generated it. */
  ranBy?: string;
};

export async function listAllocationRuns(): Promise<AllocationRun[]> {
  const rec = (await getJSON(PREFIX, ID)) as { runs?: AllocationRun[] } | null;
  return rec?.runs ?? [];
}

/** Record a run. If the newest entry is the same period, just refresh its
 *  timestamp (re-exporting a period shouldn't add duplicates). Newest first. */
export async function recordAllocationRun(run: AllocationRun): Promise<AllocationRun[]> {
  const runs = await listAllocationRuns();
  const samePeriod = (a: AllocationRun) =>
    (a.periodEndDate && a.periodEndDate === run.periodEndDate) ||
    (!a.periodEndDate && a.statementMonth === run.statementMonth);
  const next = runs.filter((r) => !samePeriod(r));
  next.unshift(run);
  const capped = next.slice(0, 36);
  await storeJSON(PREFIX, ID, { runs: capped });
  return capped;
}
