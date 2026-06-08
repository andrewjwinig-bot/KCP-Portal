// Versioned storage for uploaded operating-statement GLs.
//
// One uploaded GL = one StoredGl (per property + year), keeping every upload
// (revisions happen — sample files were already "Rev_04.06.26"). The page
// shows the latest version by default and can surface prior ones. We store the
// per-account monthly nets so a single upload powers any reporting period.

import "server-only";
import { storeJSON, listJSON, getJSON, deleteJSON } from "@/lib/storage";
import type { GlTransaction } from "./glParser";

const PREFIX = "financials-operating-statements";
const TX_PREFIX = "financials-operating-statements-tx";

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

// Transactions are stored separately (keyed by the GL upload id) so the
// compute path stays light; they're loaded only for the line-item drill-down.
export async function saveTransactions(glId: string, transactions: Record<string, GlTransaction[]>): Promise<void> {
  await storeJSON(TX_PREFIX, glId, { transactions });
}

export async function getTransactions(glId: string): Promise<Record<string, GlTransaction[]>> {
  const rec = (await getJSON(TX_PREFIX, glId)) as { transactions: Record<string, GlTransaction[]> } | null;
  return rec?.transactions ?? {};
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

// ── Line notes (variance explanations) ───────────────────────────────────────
// Free-text notes keyed by statement line, persisted per property/year so they
// carry across periods. Line key = "<section>::<label>".

const NOTES_PREFIX = "financials-operating-statements-notes";

type NotesRecord = { key: string; year: number; notes: Record<string, string> };

export async function getNotes(key: string, year: number): Promise<Record<string, string>> {
  const rec = (await getJSON(NOTES_PREFIX, `${key}-${year}`)) as NotesRecord | null;
  return rec?.notes ?? {};
}

export async function saveNote(key: string, year: number, lineKey: string, note: string): Promise<void> {
  const id = `${key}-${year}`;
  const rec = (await getJSON(NOTES_PREFIX, id)) as NotesRecord | null;
  const notes = { ...(rec?.notes ?? {}) };
  if (note.trim()) notes[lineKey] = note.trim();
  else delete notes[lineKey];
  await storeJSON(NOTES_PREFIX, id, { key, year, notes });
}

