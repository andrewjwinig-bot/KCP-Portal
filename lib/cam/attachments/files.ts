// File bytes for CAM backup attachments. Vercel Blob in production (private),
// local filesystem in dev (blob has no local mode) — mirrors lib/storage.ts so
// the feature is testable without a blob token.

import "server-only";
import { put, del } from "@vercel/blob";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import path from "path";
import type { CamAttachment } from "./store";

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), "data", "cam-attachment-files");

function localName(id: string, name: string): string {
  return `${id}-${name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
}

export async function putAttachmentFile(
  opts: { property: string; year: number; account: string; id: string; name: string; file: Blob },
): Promise<{ ref: string; local: boolean }> {
  const { property, year, account, id, name, file } = opts;
  if (USE_BLOB) {
    // Match the app's proven upload routes (maintenance/deposits/suites):
    // addRandomSuffix guarantees a unique key, so no allowOverwrite dance — and
    // in @vercel/blob v2 addRandomSuffix:false without allowOverwrite throws.
    // Sanitize each path segment (the SDK rejects "//" and caps length); the
    // human filename is preserved separately in the record's `name`.
    const seg = (v: string) => String(v).replace(/[^\w.\-]+/g, "_").slice(0, 80) || "_";
    const key = `cam-attachments/${seg(property)}/${year}/${seg(account)}/${id}-${seg(name)}`;
    const res = await put(key, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return { ref: res.url, local: false };
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  const p = path.join(LOCAL_DIR, localName(id, name));
  await writeFile(p, Buffer.from(await file.arrayBuffer()));
  return { ref: p, local: true };
}

export async function readAttachmentBytes(a: Pick<CamAttachment, "ref" | "local">): Promise<Buffer> {
  if (a.local) return readFile(a.ref);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(a.ref, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeAttachmentFile(a: Pick<CamAttachment, "ref" | "local">): Promise<void> {
  try {
    if (a.local) await unlink(a.ref);
    else if (USE_BLOB) await del(a.ref);
  } catch { /* best-effort */ }
}
