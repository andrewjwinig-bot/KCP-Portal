import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

// Sensitive reference files — the payroll allocation workbook (pay by
// employee), the 2026 budget workbooks and the New Accountant Handbook (EINs,
// bank details) — live in the portal's PRIVATE Blob store, not in the code
// repository (owner, 11/2026: "whatever is most secure"). Read through here,
// never `data/` directly.
//
// Stored at `secure-files/<name>`: private, never served by /api/blob (not in
// BLOB_FOLDERS), and copied by the nightly backup like every other document.
//
// MIGRATION: while a copy still ships in `data/<name>`, the first read (or the
// nightly backup cron, `seedSecureFiles`) uploads it into Blob. Once every file
// is in Blob, the repo copies are deleted and only Blob is read.

export const SECURE_ROOT = "secure-files/";

export const SECURE_FILES = {
  allocation: "allocation.xlsx",
  handbook: "onboarding/Korman New Accountant Handbook.docx",
  budget: (file: string) => `budgets/${file}`,
} as const;

/** Every file that has ever shipped in data/ and must reach Blob. */
export const KNOWN_SECURE_FILES = [
  SECURE_FILES.allocation,
  SECURE_FILES.handbook,
  ...["Shopping_Centers_2026.xlsx", "JV_III_2026.xlsx", "NI_LLC_2026.xlsx", "Office_Works_2026.xlsx", "LIK_Mgmt_2026.xlsx"].map(SECURE_FILES.budget),
];

const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blobPath = (name: string) => `${SECURE_ROOT}${name}`;

function safeName(name: string): string {
  if (!name || name.includes("..") || name.startsWith("/")) throw new Error(`Bad secure file name: ${name}`);
  return name;
}

async function fromBlob(name: string): Promise<Buffer | null> {
  const r = await get(blobPath(name), { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

async function fromBundle(name: string): Promise<Buffer | null> {
  return readFile(path.join(process.cwd(), "data", name)).catch(() => null);
}

export async function writeSecureFile(name: string, bytes: Buffer): Promise<void> {
  safeName(name);
  if (!blobOn()) throw new Error("Protected storage (Vercel Blob) is not configured.");
  await put(blobPath(name), bytes, { access: "private", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
}

/** The file's bytes — Blob first; the bundled copy (seeding Blob) only while
 *  one still ships. Throws when neither has it. */
export async function readSecureFile(name: string): Promise<Buffer> {
  safeName(name);
  if (blobOn()) {
    const b = await fromBlob(name);
    if (b) return b;
  }
  const local = await fromBundle(name);
  if (!local) throw new Error(`${name} is not in protected storage.`);
  if (blobOn()) {
    await writeSecureFile(name, local).then(
      () => console.log(`[secure-files] seeded ${name}`),
      (e) => console.error(`[secure-files] could not seed ${name}: ${e instanceof Error ? e.message : e}`),
    );
  }
  return local;
}

/** Copy every bundled file Blob does not have yet. Returns what is where. */
export async function seedSecureFiles(): Promise<{ inBlob: string[]; seeded: string[]; missing: string[] }> {
  const inBlob: string[] = [];
  const seeded: string[] = [];
  const missing: string[] = [];
  if (!blobOn()) return { inBlob, seeded, missing: [...KNOWN_SECURE_FILES] };
  for (const name of KNOWN_SECURE_FILES) {
    const r = await get(blobPath(name), { access: "private", useCache: false }).catch(() => null);
    if (r && r.statusCode === 200) { inBlob.push(name); continue; }
    const local = await fromBundle(name);
    if (!local) { missing.push(name); continue; }
    await writeSecureFile(name, local);
    seeded.push(name);
  }
  console.log(`[secure-files] in blob ${inBlob.length}, seeded ${seeded.length}${seeded.length ? ` (${seeded.join(", ")})` : ""}, missing ${missing.length}${missing.length ? ` (${missing.join(", ")})` : ""}`);
  return { inBlob, seeded, missing };
}
