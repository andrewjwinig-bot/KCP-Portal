/**
 * Unified JSON storage helper.
 *
 * When BLOB_READ_WRITE_TOKEN is set (production / Vercel) → Vercel Blob.
 * Otherwise → local filesystem under data/<prefix>/ (development).
 *
 * Usage:
 *   storeJSON("periods",    id, data)   → data/periods/{id}.json  or  blob payroll/periods/{id}.json
 *   storeJSON("statements", id, data)   → data/statements/{id}.json or blob payroll/statements/{id}.json
 */

import { put, list, del } from "@vercel/blob";
import { readFile, writeFile, readdir, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

function blobPath(prefix: string, id: string) {
  return `payroll/${prefix}/${id}.json`;
}

function localDir(prefix: string) {
  return path.join(process.cwd(), "data", prefix);
}

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9\-_]/g, "");
}

/** Fetch a blob URL server-side, including the auth token for private stores.
 *  Retries a few times with backoff so a transient blob hiccup (a momentary
 *  403 on a stale URL, a network blip) doesn't make the caller drop the record
 *  — listJSON skips anything that ultimately fails, so without this a single
 *  blip can blank a whole page (statements, dismissed flags, etc.). */
async function fetchBlobJson(url: string, attempts = 3): Promise<any> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      // cache: "no-store" — Vercel Blob URLs are stable across overwrites
      // (addRandomSuffix: false), so Next.js's default fetch cache would
      // happily return a stale manifest body after a write. Force fresh.
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Blob fetch failed: ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Write a JSON object. Overwrites if id already exists. */
export async function storeJSON(prefix: string, id: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  if (USE_BLOB) {
    await put(blobPath(prefix, id), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      // Stable URL + overwrite means the CDN can serve a stale body after an
      // update (e.g. flipping a 2FA record to enabled). Don't cache, so reads
      // immediately reflect the latest write.
      cacheControlMaxAge: 0,
    });
  } else {
    const dir = localDir(prefix);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${safeId(id)}.json`), body, "utf-8");
  }
}

/** List all JSON objects under a prefix. Returns parsed objects.
 *
 * Resilient: if individual blobs fail to fetch / parse (403 on a stale
 * URL, transient network, corrupted JSON, etc.) we log the failure and
 * skip just that record instead of taking down the whole list. Callers
 * routinely use this for queue-style pages (maintenance, periods, bank
 * recs); a single bad record shouldn't black out the entire page.
 */
export async function listJSON(prefix: string): Promise<any[]> {
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: `payroll/${prefix}/` });
    const settled = await Promise.allSettled(blobs.map((b) => fetchBlobJson(b.url)));
    const out: any[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        out.push(r.value);
      } else {
        console.warn(
          `storage.listJSON(${prefix}): skipped ${blobs[i].pathname} —`,
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
      }
    }
    return out;
  }
  const dir = localDir(prefix);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const settled = await Promise.allSettled(
    files.map(async (f) => {
      const raw = await readFile(path.join(dir, f), "utf-8");
      return JSON.parse(raw);
    }),
  );
  const out: any[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      out.push(r.value);
    } else {
      console.warn(
        `storage.listJSON(${prefix}): skipped ${files[i]} —`,
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  }
  return out;
}

/** Fetch a single JSON object by id. Returns null if not found.
 *
 *  `retryOnMiss` re-checks a few times when the lookup comes back empty — for
 *  records where a transient empty `list` must NOT be read as "absent" (e.g. a
 *  user's 2FA enrollment: a blip there would wrongly treat an enrolled user as
 *  never set up and re-prompt pairing). The blob `list` call is always retried
 *  on a thrown error regardless. */
export async function getJSON(prefix: string, id: string, opts?: { retryOnMiss?: boolean }): Promise<any | null> {
  const clean = safeId(id);
  if (USE_BLOB) {
    const target = blobPath(prefix, clean);
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
      let blobs: Awaited<ReturnType<typeof list>>["blobs"];
      try {
        ({ blobs } = await list({ prefix: target }));
      } catch (e) {
        if (i < maxAttempts - 1) { await new Promise((r) => setTimeout(r, 150 * (i + 1))); continue; }
        throw e;
      }
      const blob = blobs.find((b) => b.pathname === target);
      if (blob) return fetchBlobJson(blob.url);
      // Empty result. Treat as a real miss unless the caller asked us to absorb
      // a possible transient empty (then retry with backoff).
      if (opts?.retryOnMiss && i < maxAttempts - 1) { await new Promise((r) => setTimeout(r, 150 * (i + 1))); continue; }
      return null;
    }
    return null;
  } else {
    const filePath = path.join(localDir(prefix), `${clean}.json`);
    if (!existsSync(filePath)) return null;
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  }
}

/** Delete a JSON object by id. Returns true if deleted, false if not found. */
export async function deleteJSON(prefix: string, id: string): Promise<boolean> {
  const clean = safeId(id);
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: blobPath(prefix, clean) });
    const blob = blobs.find((b) => b.pathname === blobPath(prefix, clean));
    if (!blob) return false;
    await del(blob.url);
    return true;
  } else {
    const filePath = path.join(localDir(prefix), `${clean}.json`);
    if (!existsSync(filePath)) return false;
    await unlink(filePath);
    return true;
  }
}
