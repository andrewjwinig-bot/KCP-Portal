import "server-only";
import { put, list, del, get, copy } from "@vercel/blob";
import JSZip from "jszip";
import {
  BACKUP_ROOT, PART_RAW_BYTES, easternDate, fileBackupPath, isBackupPath, isJsonPath,
  snapshotsToKeep, type ManifestEntry, type SnapshotManifest,
} from "./plan";

// The nightly backup (see plan.ts for the layout). A run is RESUMABLE: it
// works through every blob in pathname order until its time budget is spent,
// writes the part it was building, saves where it got to, and the next cron
// call carries on — so a store too big for one function call still gets a
// complete snapshot the same night.

type Blob = { url: string; pathname: string; size: number; uploadedAt: string };
type FileIndex = Record<string, { uploadedAt: string; copy: string }>;
type RunState = {
  date: string;
  startedAt: string;
  index: number;
  parts: number;
  bytes: number;
  filesCopied: number;
  entries: ManifestEntry[];
  errors: string[];
};

export const backupConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const snapDir = (date: string) => `${BACKUP_ROOT}snapshots/${date}/`;
const statePath = (date: string) => `${BACKUP_ROOT}state/run-${date}.json`;
const FILE_INDEX = `${BACKUP_ROOT}state/files.json`;

async function putJson(pathname: string, data: unknown) {
  await put(pathname, JSON.stringify(data), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json", cacheControlMaxAge: 0,
  });
}

/** Read a blob's bytes past the CDN (a stale body is exactly what a backup
 *  must not capture). */
export async function readBlob(urlOrPath: string): Promise<Buffer | null> {
  const r = await get(urlOrPath, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const b = await readBlob(pathname);
    return b ? (JSON.parse(b.toString("utf8")) as T) : null;
  } catch {
    return null;
  }
}

/** Every blob under a prefix (or the whole store). */
export async function listAll(prefix?: string): Promise<Blob[]> {
  const out: Blob[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    for (const b of r.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt).toISOString() });
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

export async function readManifest(date: string): Promise<SnapshotManifest | null> {
  return readJson<SnapshotManifest>(`${snapDir(date)}manifest.json`);
}

/** Every finished snapshot, newest first (the manifest is written last, so a
 *  snapshot without one never finished). */
export async function listSnapshots(): Promise<{ date: string; finishedAt: string; documents: number; files: number; bytes: number; parts: number; errors: number }[]> {
  const manifests = (await listAll(`${BACKUP_ROOT}snapshots/`)).filter((b) => b.pathname.endsWith("/manifest.json"));
  const out = await Promise.all(manifests.map(async (b) => {
    const date = b.pathname.split("/")[2];
    const m = await readJson<SnapshotManifest>(b.pathname);
    return m ? { date, finishedAt: m.finishedAt, documents: m.documents, files: m.files, bytes: m.bytes, parts: m.parts, errors: m.errors.length } : null;
  }));
  return out.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.date.localeCompare(a.date));
}

export type BackupResult =
  | { status: "done"; date: string; manifest: SnapshotManifest; pruned: number }
  | { status: "already-done"; date: string }
  | { status: "partial"; date: string; done: number; total: number }
  | { status: "not-configured" };

/** Run (or continue) tonight's snapshot until `deadline` (epoch ms). `force`
 *  starts a fresh snapshot for the date even if one finished (Back up now). */
export async function runBackup(opts: { deadline: number; now?: Date; force?: boolean }): Promise<BackupResult> {
  if (!backupConfigured()) return { status: "not-configured" };
  const now = opts.now ?? new Date();
  const date = easternDate(now);

  let state = await readJson<RunState>(statePath(date));
  if (!state) {
    if (!opts.force && (await readManifest(date))) return { status: "already-done", date };
    state = { date, startedAt: now.toISOString(), index: 0, parts: 0, bytes: 0, filesCopied: 0, entries: [], errors: [] };
  }

  const all = (await listAll()).filter((b) => !isBackupPath(b.pathname)).sort((a, b) => a.pathname.localeCompare(b.pathname));
  const fileIndex = (await readJson<FileIndex>(FILE_INDEX)) ?? {};

  let zip = new JSZip();
  let zipRaw = 0;
  let zipCount = 0;
  const flush = async () => {
    if (!zipCount) return;
    state!.parts++;
    const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    await put(`${snapDir(date)}part-${state!.parts}.zip`, body, {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/zip",
    });
    zip = new JSZip();
    zipRaw = 0;
    zipCount = 0;
  };
  const save = async () => {
    await putJson(FILE_INDEX, fileIndex);
    await putJson(statePath(date), state);
  };

  const BATCH = 12;
  while (state.index < all.length) {
    if (Date.now() > opts.deadline) {
      await flush();
      await save();
      return { status: "partial", date, done: state.index, total: all.length };
    }
    const batch = all.slice(state.index, state.index + BATCH);
    const results = await Promise.all(batch.map(async (b) => {
      try {
        if (isJsonPath(b.pathname)) {
          const bytes = await readBlob(b.url);
          if (!bytes) throw new Error("could not be read");
          return { b, bytes };
        }
        const known = fileIndex[b.pathname];
        if (known && known.uploadedAt === b.uploadedAt) return { b, copyTo: known.copy, copied: false };
        const to = fileBackupPath(b.pathname, b.uploadedAt);
        await copy(b.url, to, { access: "private", addRandomSuffix: false, allowOverwrite: true });
        return { b, copyTo: to, copied: true };
      } catch (e) {
        return { b, error: e instanceof Error ? e.message : String(e) };
      }
    }));
    for (const r of results) {
      const { b } = r;
      state.bytes += b.size;
      if ("error" in r) {
        state.errors.push(`${b.pathname}: ${r.error}`);
        continue;
      }
      if ("bytes" in r && r.bytes) {
        zip.file(b.pathname, r.bytes);
        zipRaw += r.bytes.length;
        zipCount++;
        state.entries.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt, part: state.parts + 1 });
      } else if ("copyTo" in r && r.copyTo) {
        fileIndex[b.pathname] = { uploadedAt: b.uploadedAt, copy: r.copyTo };
        if (r.copied) state.filesCopied++;
        state.entries.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt, copy: r.copyTo });
      }
    }
    state.index += batch.length;
    if (zipRaw >= PART_RAW_BYTES) await flush();
  }
  await flush();

  const manifest: SnapshotManifest = {
    date,
    startedAt: state.startedAt,
    finishedAt: new Date().toISOString(),
    parts: state.parts,
    documents: state.entries.filter((e) => e.part != null).length,
    files: state.entries.filter((e) => e.copy).length,
    bytes: state.bytes,
    filesCopied: state.filesCopied,
    entries: state.entries,
    errors: state.errors,
  };
  await putJson(FILE_INDEX, fileIndex);
  await putJson(`${snapDir(date)}manifest.json`, manifest);
  await del(statePath(date)).catch(() => {});
  const pruned = await pruneSnapshots().catch(() => 0);
  return { status: "done", date, manifest, pruned };
}

/** Delete snapshots outside the retention (30 daily + 12 monthly). File
 *  copies are kept: they are written once per version and a deleted source
 *  file is exactly what a backup is for. */
export async function pruneSnapshots(): Promise<number> {
  const blobs = await listAll(`${BACKUP_ROOT}snapshots/`);
  const finished = new Set(blobs.filter((b) => b.pathname.endsWith("/manifest.json")).map((b) => b.pathname.split("/")[2]));
  const keep = snapshotsToKeep([...finished]);
  const doomed = blobs.filter((b) => {
    const d = b.pathname.split("/")[2];
    return finished.has(d) && !keep.has(d);
  });
  for (let i = 0; i < doomed.length; i += 100) await del(doomed.slice(i, i + 100).map((b) => b.url));
  return new Set(doomed.map((b) => b.pathname.split("/")[2])).size;
}

/** One document's bytes out of a snapshot (for viewing or restoring). */
export async function documentFromSnapshot(m: SnapshotManifest, pathname: string): Promise<Buffer | null> {
  const e = m.entries.find((x) => x.pathname === pathname);
  if (!e) return null;
  if (e.copy) return readBlob(e.copy);
  if (e.part == null) return null;
  const zipBytes = await readBlob(`${snapDir(m.date)}part-${e.part}.zip`);
  if (!zipBytes) return null;
  const z = await JSZip.loadAsync(zipBytes);
  const f = z.file(pathname);
  return f ? Buffer.from(await f.async("uint8array")) : null;
}

export async function partBytes(date: string, part: number): Promise<Buffer | null> {
  return readBlob(`${snapDir(date)}part-${part}.zip`);
}

/** Put documents back from a snapshot. Whatever is there NOW is first saved to
 *  backups/pre-restore/<stamp>/, so a restore can itself be undone. */
export async function restoreFromSnapshot(m: SnapshotManifest, pathnames: string[], by: string): Promise<{ restored: string[]; failed: string[]; savedTo: string }> {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const savedTo = `${BACKUP_ROOT}pre-restore/${stamp}/`;
  const restored: string[] = [];
  const failed: string[] = [];
  const zips = new Map<number, JSZip>();
  for (const p of pathnames) {
    try {
      const e = m.entries.find((x) => x.pathname === p);
      if (!e) throw new Error("not in this snapshot");
      if (isBackupPath(p)) throw new Error("backup paths are not restored");
      const current = await readBlob(p).catch(() => null);
      if (current) await put(`${savedTo}${p}`, current, { access: "private", addRandomSuffix: false, allowOverwrite: true });
      let bytes: Buffer | null = null;
      if (e.copy) bytes = await readBlob(e.copy);
      else if (e.part != null) {
        let z = zips.get(e.part);
        if (!z) {
          const zb = await readBlob(`${snapDir(m.date)}part-${e.part}.zip`);
          if (!zb) throw new Error("snapshot part missing");
          z = await JSZip.loadAsync(zb);
          zips.set(e.part, z);
        }
        const f = z.file(p);
        bytes = f ? Buffer.from(await f.async("uint8array")) : null;
      }
      if (!bytes) throw new Error("copy could not be read");
      await put(p, bytes, {
        access: "private", addRandomSuffix: false, allowOverwrite: true,
        contentType: isJsonPath(p) ? "application/json" : undefined, cacheControlMaxAge: 0,
      });
      restored.push(p);
    } catch (err) {
      failed.push(`${p}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await putJson(`${savedTo}_restore.json`, { at: new Date().toISOString(), by, from: m.date, restored, failed });
  return { restored, failed, savedTo };
}
