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

/** Fetch a blob URL server-side, including the auth token for private stores. */
async function fetchBlobJson(url: string): Promise<any> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  // cache: "no-store" — Vercel Blob URLs are stable across overwrites
  // (addRandomSuffix: false), so Next.js's default fetch cache would
  // happily return a stale manifest body after a write. Force fresh.
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
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

/** Fetch a single JSON object by id. Returns null if not found. */
export async function getJSON(prefix: string, id: string): Promise<any | null> {
  const clean = safeId(id);
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: blobPath(prefix, clean) });
    const blob = blobs.find((b) => b.pathname === blobPath(prefix, clean));
    if (!blob) return null;
    return fetchBlobJson(blob.url);
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
