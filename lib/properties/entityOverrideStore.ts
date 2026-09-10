// Editable overrides for the entity financials behind the Statement of Values.
// The frozen year-end snapshot lives in entityValues.ts; this overlays it so
// Harry / Alison / Drew can correct the master (name, NOI, cap rate, indicated
// value, debt, cash, future capital, equity value) without a code change.
//
// Only changed fields are stored; everything else falls back to the seed, so
// the pre-seeded rows keep their exact look until someone edits them. Editing an
// entity's equity flows straight into every owner's statement (value = their %
// × the entity's equity).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { entityValue } from "@/lib/properties/entityValues";

const PREFIX = "ownership-entities";
const ID = "current";

/** The mutable fields of an entity row. */
export interface EntityOverride {
  name?: string;
  noi?: number | null;
  capRate?: number | null;
  indicatedValue?: number | null;
  debtBalance?: number | null;
  cash?: number | null;
  futureCapital?: number | null;
  equityValue?: number | null;
}

export type EntityOverrides = Record<string, EntityOverride>;

const NUM_FIELDS = ["noi", "capRate", "indicatedValue", "debtBalance", "cash", "futureCapital", "equityValue"] as const;

export async function getEntityOverrides(): Promise<EntityOverrides> {
  return ((await getJSON(PREFIX, ID, { retryOnMiss: true })) as EntityOverrides | null) ?? {};
}

/** Upsert (or clear, when `override` is null) one entity's overrides. Fields
 *  equal to the seed are dropped so the row reverts to its pre-seeded value. */
export async function saveEntityOverride(code: string, override: EntityOverride | null): Promise<EntityOverrides> {
  const map = await getEntityOverrides();
  if (!entityValue(code)) return map; // unknown entity — ignore
  if (override === null) {
    delete map[code];
    await storeJSON(PREFIX, ID, map);
    return map;
  }
  const seed = entityValue(code)!;
  const clean: EntityOverride = {};
  // Name: keep only if non-empty and different from the seed.
  const name = (override.name ?? "").toString().trim();
  if (name && name !== seed.name) clean.name = name;
  for (const f of NUM_FIELDS) {
    if (!(f in override)) continue;
    const raw = override[f];
    if (raw === null || raw === undefined || raw === ("" as unknown)) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    if (n !== (seed[f] ?? null)) clean[f] = n;
  }
  if (Object.keys(clean).length === 0) delete map[code];
  else map[code] = clean;
  await storeJSON(PREFIX, ID, map);
  return map;
}
