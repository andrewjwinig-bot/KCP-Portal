// Per-unit office CAM config — the CAMPRep lease-level inputs (pro-rata
// share and gross-up) stored per tenant so they're captured for the future
// and editable/overridable on the unit detail page. These override the
// recon's seed lease config. Kept separate from the per-building/year escrow
// + base-year overrides (those are year-specific).

import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "cam-office-unit-config";
const ID = "all";

export type OfficeUnitConfig = { proRataPct?: number; grossUp?: boolean };
type Store = Record<string, OfficeUnitConfig>;

export async function getUnitConfigs(): Promise<Store> {
  return ((await getJSON(PREFIX, ID)) as Store | null) ?? {};
}

export async function getUnitConfig(unitRef: string): Promise<OfficeUnitConfig> {
  return (await getUnitConfigs())[unitRef] ?? {};
}

/** Merge a patch; pass a field as null to clear that override. */
export async function saveUnitConfig(
  unitRef: string,
  patch: Partial<Record<keyof OfficeUnitConfig, number | boolean | null>>,
): Promise<OfficeUnitConfig> {
  const all = await getUnitConfigs();
  const next = { ...(all[unitRef] ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length === 0) delete all[unitRef];
  else all[unitRef] = next as OfficeUnitConfig;
  await storeJSON(PREFIX, ID, all);
  return all[unitRef] ?? {};
}
