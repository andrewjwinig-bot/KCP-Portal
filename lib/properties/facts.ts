// Per-property facts edited by the maintenance team. Single-manifest
// pattern (same as maintenance requests / reservations).

import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import { FACTS_SEED } from "./factsSeed";

export type PropertyFacts = {
  yearBuilt?: number | null;
  constructionType?: string;
  roofAge?: string;
  roofType?: string;
  electricalService?: string;
  ceilingHeight?: string;
  waterService?: string;
  hvac?: string;
  restrooms?: string;
  // Also the insurance Statement of Values' columns (lib/insurance/sov.ts), so
  // the broker's form is filled FROM here each year rather than re-keyed. Text
  // on purpose: the form's own answers are "Partial", "Yes - Central Station
  // Alarm"; the fill writes a clean number back as a number. Floor area, units
  // and occupancy are NOT facts — they are the rent roll's, shown in the
  // property's header tiles.
  occupancyDescription?: string;
  yearUpgrade?: string;
  stories?: string;
  buildingCount?: string;
  sprinklered?: string;
  pctSprinklered?: string;
  parkingSqft?: string;
  basement?: string;
  floodZone?: string;
  protection?: string;
  updatedAt?: string;
};

export const PROPERTY_FACT_KEYS = [
  "yearBuilt",
  "constructionType",
  "roofAge",
  "roofType",
  "electricalService",
  "ceilingHeight",
  "waterService",
  "hvac",
  "restrooms",
  "occupancyDescription",
  "yearUpgrade",
  "stories",
  "buildingCount",
  "sprinklered",
  "pctSprinklered",
  "parkingSqft",
  "basement",
  "floodZone",
  "protection",
] as const;

type Manifest = { facts: Record<string, PropertyFacts>; updatedAt: string };

// One blob per property (was a single all-properties map, read-modify-written
// on every edit). Legacy manifest migrated to per-property blobs on first read.
const store = createMapStore<PropertyFacts>({
  prefix: "property-facts-v2",
  legacy: { prefix: "property-facts", id: "all", extract: (b) => (b as Manifest)?.facts ?? {} },
});

/** Stored facts laid over the seed (factsSeed.ts): anything keyed wins,
 *  including a field cleared to "". */
function withSeed(id: string, stored: PropertyFacts | null): PropertyFacts | null {
  const seed = FACTS_SEED[id] as PropertyFacts | undefined;
  if (!seed) return stored;
  return { ...seed, ...(stored ?? {}) };
}

export async function getFacts(id: string): Promise<PropertyFacts | null> {
  return withSeed(id, await store.get(id));
}

/** Every property's facts, keyed by property id. */
export async function allFacts(): Promise<Record<string, PropertyFacts>> {
  const stored = await store.all();
  const out: Record<string, PropertyFacts> = {};
  for (const id of new Set([...Object.keys(FACTS_SEED), ...Object.keys(stored)])) out[id] = withSeed(id, stored[id] ?? null)!;
  return out;
}

export async function saveFacts(id: string, patch: Partial<PropertyFacts>): Promise<PropertyFacts> {
  const current = (await store.get(id)) ?? {};
  const next: PropertyFacts = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.set(id, next);
  return next;
}
