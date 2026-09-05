// K-1 file bytes. Private Vercel Blob in production, local filesystem in dev —
// mirrors lib/cam/attachments/files.ts.
//
// These are tax documents carrying taxpayer IDs and capital accounts. They are
// stored private and only ever streamed through an authorized route; the blob
// URL is never handed to a browser.

import "server-only";
import { put, del } from "@vercel/blob";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import path from "path";

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), "data", "investor-k1-files");
const seg = (v: string) => String(v).replace(/[^\w.\-]+/g, "_").slice(0, 80) || "_";

export async function putK1File(
  opts: { propertyCode: string; taxYear: number; id: string; name: string; file: Blob },
): Promise<{ ref: string; local: boolean }> {
  const { propertyCode, taxYear, id, name, file } = opts;
  if (USE_BLOB) {
    const res = await put(`investor-k1/${seg(propertyCode)}/${taxYear}/${id}-${seg(name)}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || "application/pdf",
    });
    return { ref: res.url, local: false };
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  const p = path.join(LOCAL_DIR, `${id}-${seg(name)}`);
  await writeFile(p, Buffer.from(await file.arrayBuffer()));
  return { ref: p, local: true };
}

export async function readK1Bytes(d: { ref: string; local: boolean }): Promise<Buffer> {
  if (d.local) return readFile(d.ref);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(d.ref, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeK1File(d: { ref: string; local: boolean }): Promise<void> {
  try {
    if (d.local) await unlink(d.ref);
    else if (USE_BLOB) await del(d.ref);
  } catch { /* best-effort */ }
}
