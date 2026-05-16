// Server-only storage for per-suite Suite Information. Single-manifest
// pattern (same as maintenance requests / reservations): one GET per read,
// one GET+PUT per mutation. Keying suites by unitRef inside one JSON blob
// also sidesteps storage.ts's safeId() stripping of unit refs.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptySuiteInformation, type SuiteInformation } from "./information";

const PREFIX = "suite-information-manifest";
const ID = "all";

type Manifest = { suites: SuiteInformation[]; updatedAt: string };

async function loadAll(): Promise<SuiteInformation[]> {
  const m = (await getJSON(PREFIX, ID)) as Manifest | null;
  return m && Array.isArray(m.suites) ? m.suites : [];
}

async function saveAll(suites: SuiteInformation[]): Promise<void> {
  await storeJSON(PREFIX, ID, { suites, updatedAt: new Date().toISOString() });
}

export async function getSuiteInformation(
  unitRef: string,
): Promise<SuiteInformation | null> {
  const all = await loadAll();
  return all.find((s) => s.unitRef === unitRef) ?? null;
}

// Read-or-create — callers always get a usable record.
export async function getOrEmptySuiteInformation(
  unitRef: string,
): Promise<SuiteInformation> {
  return (await getSuiteInformation(unitRef)) ?? emptySuiteInformation(unitRef);
}

export async function saveSuiteInformation(
  info: SuiteInformation,
): Promise<SuiteInformation> {
  const all = await loadAll();
  const next: SuiteInformation = { ...info, updatedAt: new Date().toISOString() };
  const idx = all.findIndex((s) => s.unitRef === info.unitRef);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveAll(all);
  return next;
}
