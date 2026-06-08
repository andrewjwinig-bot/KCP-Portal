// Safe keyed-collection storage — one blob per record.
//
// Background: many stores kept a whole collection (a map or array of many
// independent records) in ONE blob and did a read-modify-write of the entire
// blob on every per-item edit. With concurrent edits (multiple staff, multiple
// tabs, or the auto-save), the second write is based on a stale read and
// silently drops the first edit — a lost-update race that deletes data.
//
// This primitive stores EACH record as its own blob under a per-collection
// prefix, so editing one record never rewrites another. There is no shared
// write path left to race on. It optionally migrates an existing single-blob
// manifest into per-record blobs on first read, then retires the legacy blob,
// so no existing data is lost in the transition.
//
// Use `createCollectionStore` for a flat collection (e.g. all tenant configs)
// and `scopedCollection` when records are grouped by a scope key such as
// `<property>-<year>` (e.g. recon overrides per property/year).

import "server-only";
import { getJSON, storeJSON, listJSON, deleteJSON } from "@/lib/storage";

/** Deterministic short hash so distinct keys that sanitize to the same string
 *  ("A/B" and "A-B") still get distinct blob ids. */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Blob id for a record key: sanitized + hash-suffixed (collision-free). */
function recordId(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 150).replace(/^_+|_+$/g, "");
  return `${safe || "k"}-${hashKey(key)}`;
}

export type CollectionStore<T> = {
  /** One record by key, or null. */
  get(key: string): Promise<T | null>;
  /** Every record in the collection. */
  all(): Promise<T[]>;
  /** Create or replace one record. Never touches other records. */
  set(key: string, value: T): Promise<void>;
  /** Remove one record. */
  remove(key: string): Promise<void>;
};

type LegacyMigration<T> = {
  /** Prefix of the legacy single-blob manifest. */
  prefix: string;
  /** Id of the legacy blob within that prefix. */
  id: string;
  /** Pull the records out of the legacy blob's parsed JSON. */
  extract: (blob: unknown) => T[];
  /** The stable key for a record (must match the store's keyOf). */
  keyOf: (value: T) => string;
};

/** Move a legacy single-blob manifest into per-record blobs, once. Idempotent:
 *  never clobbers a record that already exists per-blob, deletes the legacy
 *  blob when done. Safe under concurrent callers (writes are the same content). */
async function migrate<T>(prefix: string, legacy: LegacyMigration<T>): Promise<void> {
  const blob = await getJSON(legacy.prefix, legacy.id);
  if (blob == null) return;
  let records: T[] = [];
  try { records = legacy.extract(blob) ?? []; } catch { records = []; }
  for (const rec of records) {
    const key = legacy.keyOf(rec);
    if (!key) continue;
    const id = recordId(key);
    if (await getJSON(prefix, id)) continue; // a newer per-record edit wins
    await storeJSON(prefix, id, rec as object);
  }
  await deleteJSON(legacy.prefix, legacy.id);
}

/** A flat keyed collection (one blob per record). */
export function createCollectionStore<T>(opts: {
  /** Blob prefix; each record lives at `${prefix}/${recordId(key)}`. Use a NEW
   *  prefix (not the legacy one) so per-record blobs don't collide with it. */
  prefix: string;
  /** The stable key for a record. */
  keyOf: (value: T) => string;
  /** Optional one-time migration from a legacy single-blob manifest. */
  legacy?: Omit<LegacyMigration<T>, "keyOf">;
}): CollectionStore<T> {
  const { prefix, keyOf } = opts;
  const legacy: LegacyMigration<T> | undefined = opts.legacy ? { ...opts.legacy, keyOf } : undefined;
  const ensure = async () => { if (legacy) await migrate(prefix, legacy); };
  return {
    async get(key) {
      await ensure();
      return (await getJSON(prefix, recordId(key))) as T | null;
    },
    async all() {
      await ensure();
      return (await listJSON(prefix)) as T[];
    },
    async set(key, value) {
      // No migration needed before a write — set() replaces this record only,
      // and any legacy copy is superseded on the next read's migrate (which
      // skips records that already exist per-blob).
      await storeJSON(prefix, recordId(key), value as object);
    },
    async remove(key) {
      await deleteJSON(prefix, recordId(key));
    },
  };
}

/** A collection grouped by a scope (e.g. `<property>-<year>`). Each scope is an
 *  independent collection of per-record blobs under `${prefix}/${scope}`. */
export function scopedCollection<T>(opts: {
  prefix: string;
  keyOf: (value: T) => string;
  /** Build the legacy migration for a given scope (legacy stored one blob per
   *  scope). Omit if there's no legacy data to migrate. */
  legacyForScope?: (scope: string) => Omit<LegacyMigration<T>, "keyOf">;
}) {
  const scopeId = (scope: string) => scope.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const forScope = (scope: string): CollectionStore<T> =>
    createCollectionStore<T>({
      prefix: `${opts.prefix}/${scopeId(scope)}`,
      keyOf: opts.keyOf,
      legacy: opts.legacyForScope?.(scope),
    });
  return { forScope };
}
