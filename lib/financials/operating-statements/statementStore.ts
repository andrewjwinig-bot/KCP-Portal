// Versioned storage for uploaded operating-statement GLs.
//
// One uploaded GL = one StoredGl (per property + year), keeping every upload
// (revisions happen — sample files were already "Rev_04.06.26"). The page
// shows the latest version by default and can surface prior ones. We store the
// per-account monthly nets so a single upload powers any reporting period.

import "server-only";
import { storeJSON, listJSON, getJSON, deleteJSON } from "@/lib/storage";

const PREFIX = "financials-operating-statements";

export type StoredGl = {
  /** Stable id: gl-<key>-<year>-<timestamp>. */
  id: string;
  /** Property/fund key matching the mapping seed (e.g. "7010"). */
  key: string;
  /** Property code parsed from the GL header (usually equals key). */
  propertyCode: string | null;
  year: number;
  uploadedAt: string;
  uploadedBy?: string;
  fileName: string;
  /** Last period (month) present in the file. */
  maxPeriodInFile: number;
  /** account → 12 monthly nets (Jan–Dec). */
  monthly: Record<string, number[]>;
};

export async function saveGl(rec: StoredGl): Promise<void> {
  await storeJSON(PREFIX, rec.id, rec);
}

export async function getGl(id: string): Promise<StoredGl | null> {
  return (await getJSON(PREFIX, id)) as StoredGl | null;
}

export async function deleteGl(id: string): Promise<boolean> {
  return deleteJSON(PREFIX, id);
}

/** Lightweight metadata for every stored GL (no monthly payload). */
export type GlMeta = Omit<StoredGl, "monthly">;

export async function listGls(): Promise<GlMeta[]> {
  const all = (await listJSON(PREFIX)) as StoredGl[];
  return all
    .map(({ monthly, ...meta }) => meta)
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

/** Every version uploaded for a property/year, newest first. */
export async function versionsFor(key: string, year: number): Promise<GlMeta[]> {
  const all = await listGls();
  return all.filter((g) => g.key === key && g.year === year);
}

/** Newest stored GL for a property/year (full payload). */
export async function latestGl(key: string, year: number): Promise<StoredGl | null> {
  const versions = await versionsFor(key, year);
  if (!versions.length) return null;
  return getGl(versions[0].id);
}
