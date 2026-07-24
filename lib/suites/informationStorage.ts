// Server-only storage for per-suite Suite Information. Single-manifest
// pattern (same as maintenance requests / reservations): one GET per read,
// one GET+PUT per mutation. Keying suites by unitRef inside one JSON blob
// also sidesteps storage.ts's safeId() stripping of unit refs.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import { emptySuiteInformation, type SuiteInformation } from "./information";

type Manifest = { suites: SuiteInformation[]; updatedAt: string };

// One blob per suite (was a single all-suites manifest, read-modify-written on
// every edit). Legacy manifest migrated to per-suite blobs on first read.
const store = createCollectionStore<SuiteInformation>({
  prefix: "suite-information",
  keyOf: (s) => s.unitRef,
  legacy: { prefix: "suite-information-manifest", id: "all", extract: (b) => (b as Manifest)?.suites ?? [] },
});

export async function getSuiteInformation(
  unitRef: string,
): Promise<SuiteInformation | null> {
  return (await store.get(unitRef)) ?? null;
}

// Read-or-create — callers always get a usable record.
export async function getOrEmptySuiteInformation(
  unitRef: string,
): Promise<SuiteInformation> {
  return (await getSuiteInformation(unitRef)) ?? emptySuiteInformation(unitRef);
}

// Every stored suite record. Used by the Unit Info index to show which units
// have a floorplan / suite data without a per-unit round trip.
export async function getAllSuiteInformation(): Promise<SuiteInformation[]> {
  return store.all();
}

export async function saveSuiteInformation(
  info: SuiteInformation,
): Promise<SuiteInformation> {
  const next: SuiteInformation = { ...info, updatedAt: new Date().toISOString() };
  await store.set(info.unitRef, next);
  return next;
}
