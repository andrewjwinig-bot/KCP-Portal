// Per-unit office CAM config — the CAMPRep lease-level inputs (pro-rata
// share and gross-up) stored per tenant so they're captured for the future
// and editable/overridable on the unit detail page. These override the
// recon's seed lease config. Kept separate from the per-building/year escrow
// + base-year overrides (those are year-specific).

import { createMapStore } from "@/lib/collectionStore";

export type OfficeUnitConfig = { proRataPct?: number; grossUp?: boolean };
type Store = Record<string, OfficeUnitConfig>;

// One blob per unit (was a single all-units map, read-modify-written on every
// edit). Legacy map migrated to per-unit blobs on first read.
const store = createMapStore<OfficeUnitConfig>({
  prefix: "cam-office-unit-config-v2",
  legacy: { prefix: "cam-office-unit-config", id: "all", extract: (b) => (b as Store) ?? {} },
});

export async function getUnitConfigs(): Promise<Store> {
  return await store.all();
}

export async function getUnitConfig(unitRef: string): Promise<OfficeUnitConfig> {
  return (await store.get(unitRef)) ?? {};
}

/** Merge a patch; pass a field as null to clear that override. */
export async function saveUnitConfig(
  unitRef: string,
  patch: Partial<Record<keyof OfficeUnitConfig, number | boolean | null>>,
): Promise<OfficeUnitConfig> {
  const next = { ...((await store.get(unitRef)) ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length === 0) { await store.remove(unitRef); return {}; }
  await store.set(unitRef, next as OfficeUnitConfig);
  return next as OfficeUnitConfig;
}
