// Per-property facts edited by the maintenance team. Single-manifest
// pattern (same as maintenance requests / reservations).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

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
] as const;

const MANIFEST_PREFIX = "property-facts";
const MANIFEST_ID = "all";

type Manifest = { facts: Record<string, PropertyFacts>; updatedAt: string };

async function load(): Promise<Record<string, PropertyFacts>> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  return m?.facts ?? {};
}

async function save(facts: Record<string, PropertyFacts>): Promise<void> {
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, {
    facts,
    updatedAt: new Date().toISOString(),
  });
}

export async function getFacts(id: string): Promise<PropertyFacts | null> {
  const all = await load();
  return all[id] ?? null;
}

export async function saveFacts(id: string, patch: Partial<PropertyFacts>): Promise<PropertyFacts> {
  const all = await load();
  const current = all[id] ?? {};
  const next: PropertyFacts = { ...current, ...patch, updatedAt: new Date().toISOString() };
  all[id] = next;
  await save(all);
  return next;
}
