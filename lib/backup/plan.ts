// Backups — the pure rules (owner, 11/2026: "some sort of way to back this up
// regularly … so theres no chance that I lose this entire program").
//
// The CODE lives on GitHub. The DATA lives in ONE Vercel Blob store — rent
// rolls, budgets, ledgers, K-1s, deposits, receipts, notes — and until this had
// no second copy anywhere. A nightly snapshot copies it, versioned, so a bad
// import, a bug that overwrites a document or a deleted file can be put back.
//
// Layout inside the store (everything under BACKUP_ROOT, which the snapshot
// itself never reads):
//   backups/snapshots/<YYYY-MM-DD>/part-<n>.zip   every JSON document, zipped
//   backups/snapshots/<YYYY-MM-DD>/manifest.json  every blob that existed and
//                                                  where its copy is
//   backups/files/<version>/<pathname>             each file (PDF, image, xlsx)
//                                                  copied once per version
//   backups/state/files.json                       which file versions are copied
//   backups/state/run-<YYYY-MM-DD>.json            a run in progress (resumable)

export const BACKUP_ROOT = "backups/";

/** Raw JSON bytes per part before it is zipped. JSON compresses ~5–10×, so a
 *  part stays a few MB — small enough to stream through a function. */
export const PART_RAW_BYTES = 16 * 1024 * 1024;

/** Daily snapshots kept, then the first snapshot of each month for a year. */
export const KEEP_DAILY = 30;
export const KEEP_MONTHLY = 12;

/** A snapshot older than this means the nightly backup has stopped. */
export const STALE_AFTER_HOURS = 36;

export function isBackupPath(pathname: string): boolean {
  return pathname.startsWith(BACKUP_ROOT);
}

/** Throwaway counters (sign-in / PIN rate limits) — never worth a copy. */
export function isSkippedPath(pathname: string): boolean {
  return pathname.startsWith("rate-limits/");
}

/** A JSON document goes into the zipped parts; anything else is a FILE, copied
 *  as itself (once per version). */
export function isJsonPath(pathname: string): boolean {
  return pathname.toLowerCase().endsWith(".json");
}

/** Eastern-time calendar date for a moment — a backup run at 1am Eastern
 *  belongs to that night, whatever UTC says. */
export function easternDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Where a file version is copied to. The version is the source's upload time,
 *  so a file overwritten in place keeps every earlier copy. */
export function fileBackupPath(pathname: string, uploadedAt: string): string {
  const v = uploadedAt.replace(/[^0-9]/g, "").slice(0, 14) || "0";
  return `${BACKUP_ROOT}files/${v}/${pathname}`;
}

/** Which snapshots to keep: the newest KEEP_DAILY, plus the earliest snapshot
 *  of each of the newest KEEP_MONTHLY months. Everything else may be pruned.
 *  `dates` are YYYY-MM-DD (any order). */
export function snapshotsToKeep(dates: string[]): Set<string> {
  const sorted = [...new Set(dates)].sort();
  const keep = new Set(sorted.slice(-KEEP_DAILY));
  const firstOfMonth = new Map<string, string>();
  for (const d of sorted) {
    const m = d.slice(0, 7);
    if (!firstOfMonth.has(m)) firstOfMonth.set(m, d);
  }
  const months = [...firstOfMonth.keys()].sort().slice(-KEEP_MONTHLY);
  for (const m of months) keep.add(firstOfMonth.get(m)!);
  return keep;
}

/** A source blob as the manifest records it. */
export type ManifestEntry = {
  pathname: string;
  size: number;
  uploadedAt: string;
  /** JSON: which part zip holds it. */
  part?: number;
  /** File: where its copy is. */
  copy?: string;
};

export type SnapshotManifest = {
  date: string;
  startedAt: string;
  finishedAt: string;
  parts: number;
  documents: number;
  files: number;
  bytes: number;
  /** Files copied for the first time (or a new version) tonight. */
  filesCopied: number;
  entries: ManifestEntry[];
  errors: string[];
};

/** Group a manifest into top-level folders for the restore page:
 *  `payroll/rentroll-history/2026-10.json` → `payroll/rentroll-history`. */
export function folderOf(pathname: string): string {
  const parts = pathname.split("/");
  if (parts.length <= 1) return "(top level)";
  if (parts[0] === "payroll" && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

export function folderSummary(entries: ManifestEntry[]): { folder: string; documents: number; files: number; bytes: number }[] {
  const m = new Map<string, { folder: string; documents: number; files: number; bytes: number }>();
  for (const e of entries) {
    const f = folderOf(e.pathname);
    const row = m.get(f) ?? { folder: f, documents: 0, files: 0, bytes: 0 };
    if (e.part != null) row.documents++; else row.files++;
    row.bytes += e.size;
    m.set(f, row);
  }
  return [...m.values()].sort((a, b) => a.folder.localeCompare(b.folder));
}

/** Is the newest finished snapshot recent enough? */
export function backupHealth(latestFinishedAt: string | null, now: Date): { ok: boolean; hoursAgo: number | null } {
  if (!latestFinishedAt) return { ok: false, hoursAgo: null };
  const h = (now.getTime() - new Date(latestFinishedAt).getTime()) / 3_600_000;
  return { ok: h <= STALE_AFTER_HOURS, hoursAgo: Math.round(h) };
}
