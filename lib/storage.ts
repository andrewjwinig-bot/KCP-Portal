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

/** Write a JSON object. Overwrites if id already exists. */
export async function storeJSON(prefix: string, id: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  if (USE_BLOB) {
    await put(blobPath(prefix, id), body, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });
  } else {
    const dir = localDir(prefix);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${safeId(id)}.json`), body, "utf-8");
  }
}

/** List all JSON objects under a prefix. Returns parsed objects. */
export async function listJSON(prefix: string): Promise<any[]> {
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: `payroll/${prefix}/` });
    return Promise.all(
      blobs.map(async (b) => {
        const res = await fetch(b.url);
        return res.json();
      })
    );
  } else {
    const dir = localDir(prefix);
    if (!existsSync(dir)) return [];
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    return Promise.all(
      files.map(async (f) => {
        const raw = await readFile(path.join(dir, f), "utf-8");
        return JSON.parse(raw);
      })
    );
  }
}

/** Fetch a single JSON object by id. Returns null if not found. */
export async function getJSON(prefix: string, id: string): Promise<any | null> {
  const clean = safeId(id);
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: blobPath(prefix, clean) });
    const blob = blobs.find((b) => b.pathname === blobPath(prefix, clean));
    if (!blob) return null;
    const res = await fetch(blob.url);
    if (!res.ok) return null;
    return res.json();
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
