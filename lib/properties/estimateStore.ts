// "Today" estimated equity values for the Statement of Values — a single
// current-estimate per entity plus one shared as-of date. Deliberately NOT a
// monthly time series (unlike the operating-statement stores): year-end equity
// is the frozen snapshot in entityValues.ts, and this holds only the latest
// estimate staff want to circulate alongside it.
//
// One small blob. An entity with no override simply shows its year-end value as
// the current estimate (i.e. "unchanged since year-end").

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "ownership-estimates";
const ID = "current";

export interface OwnershipEstimates {
  /** As-of date for the estimates (ISO yyyy-mm-dd). "" when never set. */
  asOf: string;
  /** entity code → estimated current equity value. Missing = use year-end. */
  values: Record<string, number>;
  /** Last save timestamp (ISO). */
  updatedAt?: string;
}

const EMPTY: OwnershipEstimates = { asOf: "", values: {} };

export async function getEstimates(): Promise<OwnershipEstimates> {
  const rec = (await getJSON(PREFIX, ID, { retryOnMiss: true })) as OwnershipEstimates | null;
  if (!rec) return { ...EMPTY };
  return { asOf: rec.asOf ?? "", values: rec.values ?? {}, updatedAt: rec.updatedAt };
}

export async function saveEstimates(input: { asOf: string; values: Record<string, number> }): Promise<OwnershipEstimates> {
  // Keep only finite numeric overrides; drop blanks so an entity reverts to
  // year-end rather than persisting a 0.
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.values ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) values[k] = Math.round(v);
  }
  const rec: OwnershipEstimates = { asOf: input.asOf || "", values, updatedAt: new Date().toISOString() };
  await storeJSON(PREFIX, ID, rec);
  return rec;
}
