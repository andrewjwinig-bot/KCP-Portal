"use client";

// READ A FOLDER OF THE SHARE DRIVE FROM CHROME (owner, 11/2026: "any way for
// the portal to open that share drive on google chrome and pull them all
// themselves?"). The share drive is synced to the computer by OneDrive, and
// Chrome / Edge let a page read a folder the person picks ONCE. The folder is
// remembered in this browser (IndexedDB); on a later visit Chrome asks for a
// one-click Allow (or not at all once "Allow on every visit" is chosen).
//
// A browser cannot read a folder without someone there: the pull starts from
// a click. Firefox / Safari have no such API (`folderAccessSupported`).

type Perm = "granted" | "denied" | "prompt";
export type DirHandle = {
  kind: "directory";
  name: string;
  values: () => AsyncIterable<DirHandle | FileHandle>;
  queryPermission?: (o: { mode: "read" }) => Promise<Perm>;
  requestPermission?: (o: { mode: "read" }) => Promise<Perm>;
};
export type FileHandle = { kind: "file"; name: string; getFile: () => Promise<File> };

const DB = "kcp-share-folders", STORE = "handles";

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  });
}

export function folderAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && window.self === window.top;
}

/** The folder connected under `id`, with read permission — asking for it if
 *  needed (must run from a click). Null when none is connected or it is refused. */
export async function connectedFolder(id: string): Promise<DirHandle | null> {
  const h = await idb<DirHandle | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
  if (!h) return null;
  let p = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
  if (p !== "granted") p = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
  return p === "granted" ? h : null;
}

/** Ask the person to pick the folder, and remember it under `id`. */
export async function connectFolder(id: string): Promise<DirHandle | null> {
  const w = window as unknown as { showDirectoryPicker: (o: { id: string; mode: "read"; startIn?: string }) => Promise<DirHandle> };
  try {
    const h = await w.showDirectoryPicker({ id: id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32), mode: "read", startIn: "documents" });
    await idb("readwrite", (s) => s.put(h, id)).catch(() => undefined);
    return h;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return null;
    throw e;
  }
}

export async function forgetFolder(id: string): Promise<void> {
  await idb("readwrite", (s) => s.delete(id)).catch(() => undefined);
}

/** A sub-folder by name, case-insensitive; or by a test. */
export async function child(dir: DirHandle, match: string | ((name: string) => boolean)): Promise<DirHandle | null> {
  const ok = typeof match === "string" ? (n: string) => n.toLowerCase() === match.toLowerCase() : match;
  for await (const e of dir.values()) if (e.kind === "directory" && ok(e.name)) return e;
  return null;
}

/** Every file under `dir`, down to `depth` folders, with its folder path. */
export async function filesUnder(dir: DirHandle, depth = 2, path = ""): Promise<{ path: string; handle: FileHandle }[]> {
  const out: { path: string; handle: FileHandle }[] = [];
  for await (const e of dir.values()) {
    if (e.kind === "file") out.push({ path: path + e.name, handle: e });
    else if (depth > 0) out.push(...(await filesUnder(e, depth - 1, `${path}${e.name}/`)));
  }
  return out;
}

/** Walk down from wherever the person connected to the folder at `segments`:
 *  connecting "KCP - Documents", "Data", "Accounting" or deeper all work. */
export async function resolvePath(root: DirHandle, segments: string[]): Promise<DirHandle | null> {
  const lower = segments.map((s) => s.toLowerCase());
  let at = lower.indexOf(root.name.toLowerCase());
  let dir: DirHandle | null = root;
  // The connected folder is above the path (e.g. "KCP - Documents"): start at the top.
  if (at < 0) at = -1;
  for (const seg of segments.slice(at + 1)) {
    dir = await child(dir, seg);
    if (!dir) return null;
  }
  return dir;
}

/** The one share-drive folder every page uses (KCP - Documents, or lower). */
export const SHARE_ID = "share-drive";

/** Files to import for `spec`, read from the connected share drive. Tries
 *  `year`, then the year before (early January, before the new folder fills).
 *  Throws a plain-English Error when the folder or a file can't be found. */
export async function pullFromShare(spec: import("@/lib/shareDrive/pullSpecs").PullSpec, year = new Date().getFullYear()): Promise<{ files: File[]; folder: string } | null> {
  const root = (await connectedFolder(SHARE_ID)) ?? (await connectFolder(SHARE_ID));
  if (!root) return null;
  let sawFolder = false;
  for (const y of [year, year - 1]) {
    const dir = await resolvePath(root, spec.segments(y));
    if (!dir) continue;
    sawFolder = true;
    const all: FileHandle[] = [];
    for await (const e of dir.values()) if (e.kind === "file") all.push(e);
    const got = await Promise.all(all.map((f) => f.getFile()));
    const want = new Set(spec.pick(got.map((g) => ({ name: g.name, modified: g.lastModified }))));
    if (!want.size) continue;
    const files = got.filter((g) => want.has(g.name));
    return { files, folder: spec.segments(y).join("\\") };
  }
  if (!sawFolder) {
    await forgetFolder(SHARE_ID);
    throw new Error(`Couldn't find ${spec.segments(year).join("\\")} in "${root.name}". Click again and choose your KCP - Documents folder.`);
  }
  throw new Error(`No ${spec.what} in ${spec.segments(year).join("\\")} yet — files saved with the month number in front, like "11 …".`);
}
