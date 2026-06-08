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

export type NoteSource = "user" | "ai";
/** Who last touched a note + when, for the "Last edited … by …" line. */
export type NoteMeta = { editedAt: string; editedBy: string };

// ── Per-line note storage ────────────────────────────────────────────────────
// Each note is its own blob under a per-(property,year) scope, so saving one
// line never rewrites another. The old design stored ALL of a property/year's
// notes in a single blob and did a read-modify-write on every save — with the
// auto-save firing frequently, concurrent saves raced and silently dropped each
// other's notes (lost-update). One blob per line removes the shared write path.
type NoteLineRecord = { key: string; year: number; lineKey: string; note: string; source: NoteSource; editedAt: string; editedBy: string };
/** Legacy shared record (pre per-line storage) — migrated then deleted. */
type LegacyNotesRecord = { key: string; year: number; notes: Record<string, string>; sources?: Record<string, NoteSource>; meta?: Record<string, NoteMeta> };

const noteScope = (key: string, year: number): string =>
  `${NOTES_PREFIX}/${`${key}-${year}`.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
const noteSlug = (lineKey: string): string => lineKey.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 180) || "note";

/** Move any legacy single-blob record into per-line blobs, then drop it. Idempotent. */
async function migrateLegacyNotes(key: string, year: number): Promise<void> {
  const legacy = (await getJSON(NOTES_PREFIX, `${key}-${year}`)) as LegacyNotesRecord | null;
  if (!legacy?.notes || Object.keys(legacy.notes).length === 0) return;
  const scope = noteScope(key, year);
  for (const [lineKey, note] of Object.entries(legacy.notes)) {
    if (!note || !note.trim()) continue;
    const slug = noteSlug(lineKey);
    if (await getJSON(scope, slug)) continue; // never clobber a newer per-line edit
    const source = legacy.sources?.[lineKey] ?? "ai";
    const m = legacy.meta?.[lineKey];
    await storeJSON(scope, slug, {
      key, year, lineKey, note: note.trim(), source,
      editedAt: m?.editedAt ?? new Date().toISOString(),
      editedBy: m?.editedBy ?? (source === "ai" ? "Auto-explain" : "Unknown"),
    } satisfies NoteLineRecord);
  }
  await deleteJSON(NOTES_PREFIX, `${key}-${year}`);
}

/** All of a property/year's notes, sources, and edit metadata in one read. */
export async function getNotesBundle(key: string, year: number): Promise<{ notes: Record<string, string>; sources: Record<string, NoteSource>; meta: Record<string, NoteMeta> }> {
  await migrateLegacyNotes(key, year);
  const recs = (await listJSON(noteScope(key, year))) as NoteLineRecord[];
  const notes: Record<string, string> = {};
  const sources: Record<string, NoteSource> = {};
  const meta: Record<string, NoteMeta> = {};
  for (const r of recs) {
    if (!r?.lineKey || !r.note) continue;
    notes[r.lineKey] = r.note;
    sources[r.lineKey] = r.source ?? "ai";
    if (r.editedAt) meta[r.lineKey] = { editedAt: r.editedAt, editedBy: r.editedBy ?? "Unknown" };
  }
  return { notes, sources, meta };
}

export async function getNotes(key: string, year: number): Promise<Record<string, string>> {
  return (await getNotesBundle(key, year)).notes;
}
export async function getNoteSources(key: string, year: number): Promise<Record<string, NoteSource>> {
  return (await getNotesBundle(key, year)).sources;
}
export async function getNoteMeta(key: string, year: number): Promise<Record<string, NoteMeta>> {
  return (await getNotesBundle(key, year)).meta;
}

export async function saveNote(
  key: string,
  year: number,
  lineKey: string,
  note: string,
  source: NoteSource = "user",
  editor?: string
): Promise<void> {
  const scope = noteScope(key, year);
  const slug = noteSlug(lineKey);
  if (note.trim()) {
    const prev = (await getJSON(scope, slug)) as NoteLineRecord | null;
    await storeJSON(scope, slug, {
      key, year, lineKey, note: note.trim(), source,
      editedAt: new Date().toISOString(),
      editedBy: source === "ai" ? "Auto-explain" : (editor || "Unknown"),
    } satisfies NoteLineRecord);
    // Training signal: a human editing an AI note into something different.
    if (source === "user" && prev?.source === "ai" && prev.note && note.trim() !== prev.note) {
      await recordNoteEdit({ key, year, lineKey, aiNote: prev.note, userNote: note.trim(), editedAt: new Date().toISOString() });
    }
  } else {
    await deleteJSON(scope, slug);
    // Belt-and-suspenders: drain the line from any legacy record so a delete
    // doesn't resurrect it on the next migration.
    const legacy = (await getJSON(NOTES_PREFIX, `${key}-${year}`)) as LegacyNotesRecord | null;
    if (legacy?.notes?.[lineKey] !== undefined) {
      const notes = { ...legacy.notes }; delete notes[lineKey];
      const sources = { ...(legacy.sources ?? {}) }; delete sources[lineKey];
      const meta = { ...(legacy.meta ?? {}) }; delete meta[lineKey];
      await storeJSON(NOTES_PREFIX, `${key}-${year}`, { key, year, notes, sources, meta });
    }
  }
}

// ── Note feedback log (AI note → human correction) ───────────────────────────
const FEEDBACK_PREFIX = "financials-operating-statements-note-feedback";

export type NoteEdit = {
  key: string;
  year: number;
  lineKey: string;
  /** The note the AI originally wrote. */
  aiNote: string;
  /** What the human changed it to. */
  userNote: string;
  editedAt: string;
};

async function recordNoteEdit(edit: NoteEdit): Promise<void> {
  // One record per edit; a slug keeps concurrent edits from clobbering.
  const slug = `${edit.key}-${edit.year}-${edit.lineKey}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 200);
  await storeJSON(FEEDBACK_PREFIX, slug, edit);
}

/** All captured AI→human note corrections, newest first. */
export async function listNoteEdits(): Promise<NoteEdit[]> {
  const all = (await listJSON(FEEDBACK_PREFIX)) as NoteEdit[];
  return all.sort((a, b) => (b.editedAt || "").localeCompare(a.editedAt || ""));
}

