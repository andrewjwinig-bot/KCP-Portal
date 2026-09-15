// Per-building, per-year lease config for the office reconciliation.
//
// Base year, gross-up, pro-rata share and escrow are seeded from the
// reconciliation workbook and then editable at recon time. Edits are stored
// as a sparse per-unit override map keyed by "<property>-<year>" and merged
// over the seed on read, so the workbook values ship with the code and only
// changed fields are persisted.
//
// Base years live here (not in tenant-meta) on purpose: a reconciliation is
// a point-in-time calculation, and a tenant's base year for 2025 must stay
// fixed even if its current base year is later reset — tenant-meta holds the
// single current value, this holds the value that applied to the recon year.

import { scopedMap } from "@/lib/collectionStore";
import type { OfficeLeaseConfig } from "./assemble";

/** Sparse per-unit overrides; only changed fields are stored. */
export type OfficeConfigOverrides = Record<string, Partial<OfficeLeaseConfig>>;

const storeKey = (property: string, year: number): string => `${property}-${year}`;

// One blob per unit (was a single per-property/year override map, read-modify-
// written on every recon cell edit). Legacy per-scope blob migrated on first read.
const overrides = scopedMap<Partial<OfficeLeaseConfig>>({
  prefix: "cam-office-config-v2",
  legacyForScope: (scope) => ({ prefix: "cam-office-config", id: scope, extract: (b) => (b as OfficeConfigOverrides) ?? {} }),
});

export async function getOverrides(property: string, year: number): Promise<OfficeConfigOverrides> {
  return await overrides.forScope(storeKey(property, year)).all();
}

/** Merge stored overrides over the seed config. Override fields set to
 *  null/undefined fall back to the seed (i.e. "revert to default"). */
export function mergeConfig(
  seed: Record<string, OfficeLeaseConfig>,
  overrides: OfficeConfigOverrides,
): Record<string, OfficeLeaseConfig> {
  const out: Record<string, OfficeLeaseConfig> = {};
  for (const [unitRef, base] of Object.entries(seed)) {
    const ov = overrides[unitRef] ?? {};
    const clean: Partial<OfficeLeaseConfig> = {};
    for (const [k, v] of Object.entries(ov)) {
      if (v !== null && v !== undefined) (clean as any)[k] = v;
    }
    out[unitRef] = { ...base, ...clean };
  }
  return out;
}

/** Coerce + persist a single unit's override patch. Pass a field value of
 *  null to clear that override (revert to the seed). Returns the updated
 *  override map. */
export async function saveOverride(
  property: string,
  year: number,
  unitRef: string,
  patch: Partial<Record<keyof OfficeLeaseConfig, number | boolean | null>>,
): Promise<OfficeConfigOverrides> {
  const scope = overrides.forScope(storeKey(property, year));
  const next = { ...((await scope.get(unitRef)) ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length === 0) await scope.remove(unitRef);
  else await scope.set(unitRef, next as Partial<OfficeLeaseConfig>);
  return await scope.all();
}
