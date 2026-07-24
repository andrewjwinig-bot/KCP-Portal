// Versioned storage for uploaded operating-statement GLs.
//
// One uploaded GL = one StoredGl (per property + year), keeping every upload
// (revisions happen — sample files were already "Rev_04.06.26"). The page
// shows the latest version by default and can surface prior ones. We store the
// per-account monthly nets so a single upload powers any reporting period.

import "server-only";
import { storeJSON, listJSON, getJSON, deleteJSON } from "@/lib/storage";
import type { GlTransaction } from "./glParser";
import { assembleGls, mergeTransactions } from "./glAssemble";
import { applyPostingDeltas, applyPostingTransactions, postingDeltasFor } from "./postingDeltaStore";
import { glKeysFor } from "@/lib/financials/cash-analysis/funds";

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
  /** account → Beginning Balance (opening). Present on uploads after this was
   *  added; older uploads omit it (ending balances fall back to YTD net). */
  beginning?: Record<string, number>;
  /** account → the GL's "YTD Total" row (ending balance for balance-sheet
   *  accounts). Drives the Operating Cash KPI. Present on newer uploads. */
  ytdTotal?: Record<string, number>;
  /** account → account name from the GL header (e.g. "Cash - Operating").
   *  Present on uploads after account-name capture was added; older uploads
   *  omit it (the UI then shows the bare account number). */
  names?: Record<string, string>;
  /** First month (1–12) the data covers — set when GLs are merged
   *  (assembleGls), so cash math knows a partial-year import has no opening
   *  before this month. Absent on a single raw upload. */
  coverageStartMonth?: number;
  /** Last month of the report range ("posted through"); set by assembleGls. */
  coverageEnd?: number;
  /** False when the GL was imported "monthly totals only" (transaction detail
   *  skipped to save storage — line drill-down won't have rows). Absent = true
   *  (older uploads always stored transactions). */
  transactionsStored?: boolean;
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

/** Transactions for a property/year merged across every uploaded GL — the
 *  transaction-level counterpart to {@link assembledGl}. Mirrors the same
 *  coverage rule: each upload owns the months it covers, and a newer upload's
 *  months supersede an older one's. Without this the line-detail drill-down
 *  reads only the newest single upload, so a property uploaded as multiple
 *  files (monthly, or a revision) shows incomplete — or zero — line detail. */
export async function assembledTransactions(key: string, year: number): Promise<Record<string, GlTransaction[]>> {
  // A fund key aggregates its member buildings (the same set its monthly nets
  // consolidate) — transactions are stored under each member's GL, not the fund
  // key, so a fund drill-down would otherwise show nothing. Each member's own
  // uploads are coverage-merged, then unioned across members.
  const keys = glKeysFor(key);
  const all = await listFullGls();
  const out: Record<string, GlTransaction[]> = {};
  for (const k of keys) {
    const gls = all.filter((g) => g.key === k && g.year === year);
    let merged: Record<string, GlTransaction[]> = {};
    let coveredThrough = 0;
    if (gls.length) {
      const versions = await Promise.all(
        gls.map(async (g) => ({ ...g, transactions: await getTransactions(g.id) }))
      );
      merged = mergeTransactions(versions);
      const base = assembleGls(gls);
      coveredThrough = base?.coverageEnd ?? base?.maxPeriodInFile ?? 0;
    }
    // Interim posting deltas layer on for months the full GL doesn't cover.
    const deltas = await postingDeltasFor(k, year);
    const withDeltas = applyPostingTransactions(merged, deltas, coveredThrough);
    for (const [acct, txs] of Object.entries(withDeltas)) {
      out[acct] = out[acct] ? out[acct].concat(txs) : txs;
    }
  }
  return out;
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

/** Every stored GL with its full monthly payload, in one batch read. Used to
 *  assemble/merge across uploads (and to compute the cash sheet for all
 *  properties from a single fetch instead of one-per-property). */
export async function listFullGls(): Promise<StoredGl[]> {
  return (await listJSON(PREFIX)) as StoredGl[];
}

/** Merge the account names captured across every uploaded GL into one
 *  chart-of-accounts lookup. GL account codes are consistent across properties,
 *  so a name captured on one property (e.g. 1100) labels the same account on
 *  every property — used as a fallback for GLs uploaded before name capture. */
export function mergeAccountNames(gls: GlMeta[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of gls) {
    if (!g.names) continue;
    for (const [acct, nm] of Object.entries(g.names)) {
      if (nm && !out[acct]) out[acct] = nm;
    }
  }
  return out;
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

/** All uploaded GLs for a property/year merged into one continuous series, so
 *  every uploaded month is present (cumulative or month-by-month uploads). */
export async function assembledGl(key: string, year: number): Promise<StoredGl | null> {
  const all = await listFullGls();
  const base = assembleGls(all.filter((g) => g.key === key && g.year === year));
  // Layer interim posting-report deltas on months the full GL doesn't cover.
  const deltas = await postingDeltasFor(key, year);
  return applyPostingDeltas(base, deltas, key, year);
}

/** GL for a key, consolidating a fund's member buildings (a fund has no GL of
 *  its own — its monthly nets are the account-level sum of its members, matching
 *  the operating-statement + cash-analysis rollups). Non-fund keys are unchanged. */
export async function assembledGlConsolidated(key: string, year: number): Promise<StoredGl | null> {
  const keys = glKeysFor(key);
  if (keys.length <= 1) return assembledGl(key, year);
  const parts = (await Promise.all(keys.map((k) => assembledGl(k, year)))).filter((g): g is StoredGl => !!g);
  if (!parts.length) return null;
  const monthly: Record<string, number[]> = {};
  const beginning: Record<string, number> = {};
  const ytdTotal: Record<string, number> = {};
  const names: Record<string, string> = {};
  let maxPeriodInFile = 0, coverageEnd = 0;
  let coverageStartMonth: number | undefined;
  for (const g of parts) {
    for (const [a, nets] of Object.entries(g.monthly)) {
      const arr = (monthly[a] ??= new Array(12).fill(0));
      for (let i = 0; i < 12; i++) arr[i] += nets[i] ?? 0;
    }
    if (g.beginning) for (const [a, v] of Object.entries(g.beginning)) beginning[a] = (beginning[a] ?? 0) + v;
    if (g.ytdTotal) for (const [a, v] of Object.entries(g.ytdTotal)) ytdTotal[a] = (ytdTotal[a] ?? 0) + v;
    if (g.names) for (const [a, n] of Object.entries(g.names)) if (n && !names[a]) names[a] = n;
    maxPeriodInFile = Math.max(maxPeriodInFile, g.maxPeriodInFile || 0);
    coverageEnd = Math.max(coverageEnd, g.coverageEnd ?? g.maxPeriodInFile ?? 0);
    if (g.coverageStartMonth != null) coverageStartMonth = Math.min(coverageStartMonth ?? 12, g.coverageStartMonth);
  }
  return { ...parts[parts.length - 1], monthly, beginning, ytdTotal, names, maxPeriodInFile, coverageEnd, coverageStartMonth };
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
type NoteLineRecord = { key: string; year: number; period: number; lineKey: string; note: string; source: NoteSource; editedAt: string; editedBy: string };

// Notes are scoped per (property, year, PERIOD/month) so each month's variance
// explanations are independent — a comment on January never shows on February.
const noteScope = (key: string, year: number, period: number): string =>
  `${NOTES_PREFIX}/${`${key}-${year}-${period}`.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
const noteSlug = (lineKey: string): string => lineKey.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 180) || "note";

// Old (pre per-month) notes lived in a year-level scope. Before per-month notes
// existed they were entered against January's view, so — one time — move any
// that remain into January (period 1) and delete the old blobs, so prior work
// (auto-explained + manual) isn't lost and this doesn't re-run.
const legacyYearScope = (key: string, year: number): string =>
  `${NOTES_PREFIX}/${`${key}-${year}`.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;

async function recoverLegacyYearNotes(key: string, year: number): Promise<void> {
  const oldScope = legacyYearScope(key, year);
  const recs = (await listJSON(oldScope)) as NoteLineRecord[];
  if (!recs.length) return;
  const target = noteScope(key, year, 1);
  for (const r of recs) {
    if (!r?.lineKey || !r.note) continue;
    const slug = noteSlug(r.lineKey);
    if (!(await getJSON(target, slug))) {
      await storeJSON(target, slug, { ...r, period: 1 } satisfies NoteLineRecord);
    }
  }
  for (const r of recs) if (r?.lineKey) await deleteJSON(oldScope, noteSlug(r.lineKey));
}

/** All of a property/year/period's notes, sources, and edit metadata in one read. */
export async function getNotesBundle(key: string, year: number, period: number): Promise<{ notes: Record<string, string>; sources: Record<string, NoteSource>; meta: Record<string, NoteMeta> }> {
  await recoverLegacyYearNotes(key, year);
  const recs = (await listJSON(noteScope(key, year, period))) as NoteLineRecord[];
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

export async function getNotes(key: string, year: number, period: number): Promise<Record<string, string>> {
  return (await getNotesBundle(key, year, period)).notes;
}

export async function saveNote(
  key: string,
  year: number,
  period: number,
  lineKey: string,
  note: string,
  source: NoteSource = "user",
  editor?: string
): Promise<void> {
  const scope = noteScope(key, year, period);
  const slug = noteSlug(lineKey);
  if (note.trim()) {
    const prev = (await getJSON(scope, slug)) as NoteLineRecord | null;
    await storeJSON(scope, slug, {
      key, year, period, lineKey, note: note.trim(), source,
      editedAt: new Date().toISOString(),
      editedBy: source === "ai" ? "Auto-explain" : (editor || "Unknown"),
    } satisfies NoteLineRecord);
    // Training signal: a human editing an AI note into something different.
    if (source === "user" && prev?.source === "ai" && prev.note && note.trim() !== prev.note) {
      await recordNoteEdit({ key, year, lineKey, aiNote: prev.note, userNote: note.trim(), editedAt: new Date().toISOString() });
    }
  } else {
    await deleteJSON(scope, slug);
  }
}

// ── "?" investigate-flag dismissals ──────────────────────────────────────────
// When a line's "looks off" flag has been investigated and confirmed fine, it's
// dismissed for that (property, year, period). Stored ONE BLOB PER dismissed line
// (like notes) — the old single-blob read-modify-write raced when several flags
// were dismissed in quick succession and silently lost one, so a dismissal could
// "reappear" on the next refresh.
const FLAG_DISMISS_PREFIX = "financials-operating-statements-flagdismiss";
type DismissRecord = { key: string; year: number; period: number; lineKey: string; dismissedAt: string };

// Legacy single-blob id ({ lineKeys: [...] } per period) — migrated on read.
const dismissId = (key: string, year: number, period: number): string =>
  `${key}-${year}-${period}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
const dismissScope = (key: string, year: number, period: number): string =>
  `${FLAG_DISMISS_PREFIX}/${`${key}-${year}-${period}`.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
const dismissSlug = (lineKey: string): string => lineKey.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 180) || "flag";

// One-time migration: fan the old single blob's lineKeys out into per-line blobs,
// then delete the legacy blob so existing dismissals aren't lost and this stops
// running once migrated.
async function recoverLegacyDismissals(key: string, year: number, period: number): Promise<void> {
  const rec = (await getJSON(FLAG_DISMISS_PREFIX, dismissId(key, year, period))) as { lineKeys?: string[] } | null;
  if (!rec?.lineKeys?.length) return;
  const scope = dismissScope(key, year, period);
  for (const lk of rec.lineKeys) {
    const slug = dismissSlug(lk);
    if (!(await getJSON(scope, slug))) {
      await storeJSON(scope, slug, { key, year, period, lineKey: lk, dismissedAt: new Date().toISOString() } satisfies DismissRecord);
    }
  }
  await deleteJSON(FLAG_DISMISS_PREFIX, dismissId(key, year, period));
}

export async function getDismissedFlags(key: string, year: number, period: number): Promise<string[]> {
  await recoverLegacyDismissals(key, year, period);
  const recs = (await listJSON(dismissScope(key, year, period))) as DismissRecord[];
  return recs.filter((r) => r?.lineKey).map((r) => r.lineKey);
}

export async function setFlagDismissed(key: string, year: number, period: number, lineKey: string, dismissed: boolean): Promise<string[]> {
  const scope = dismissScope(key, year, period);
  const slug = dismissSlug(lineKey);
  if (dismissed) {
    await storeJSON(scope, slug, { key, year, period, lineKey, dismissedAt: new Date().toISOString() } satisfies DismissRecord);
  } else {
    await deleteJSON(scope, slug);
  }
  return getDismissedFlags(key, year, period);
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

