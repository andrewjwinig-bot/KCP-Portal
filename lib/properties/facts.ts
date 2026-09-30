// Per-property facts edited by the maintenance team. Single-manifest
// pattern (same as maintenance requests / reservations).

import "server-only";
import { createMapStore } from "@/lib/collectionStore";

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
  // Insurance — the Statement of Values columns (lib/insurance/sov.ts). Kept
  // here, with the rest of the building's facts, so the broker's form is
  // filled FROM property info each year rather than re-keyed on the form.
  // Text on purpose: the form's own answers are "Partial", "Yes - Central
  // Station Alarm", "included in above"; the fill writes a clean number back
  // as a number.
  occupancyDescription?: string;
  yearUpgrade?: string;
  stories?: string;
  buildingCount?: string;
  sprinklered?: string;
  pctSprinklered?: string;
  units?: string;
  floorArea?: string;
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
  "units",
  "floorArea",
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

export async function getFacts(id: string): Promise<PropertyFacts | null> {
  return await store.get(id);
}

/** Every property's facts, keyed by property id. */
export async function allFacts(): Promise<Record<string, PropertyFacts>> {
  return await store.all();
}

export async function saveFacts(id: string, patch: Partial<PropertyFacts>): Promise<PropertyFacts> {
  const current = (await store.get(id)) ?? {};
  const next: PropertyFacts = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.set(id, next);
  return next;
}
