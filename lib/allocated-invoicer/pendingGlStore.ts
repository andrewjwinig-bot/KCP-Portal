// Hand-off of the 2000 G&A GL from Operating Statements → Allocated Expense
// Invoicer. The invoicer and the 2000 operating statement parse the exact same
// Detailed General Ledger file, so when that GL is uploaded on the Operating
// Statements tab we stash the raw bytes here. The invoicer then offers to load
// + generate the allocated invoices from it — no second upload of the same file.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "allocated-invoicer";
const ID = "pending-gl";

export type PendingGl = {
  /** The raw uploaded GL, base64-encoded, so the invoicer re-parses the same file. */
  fileBase64: string;
  fileName: string;
  /** G&A entity code (2000). */
  propertyCode: string;
  year: number;
  /** Latest month in the GL (1-12). */
  month: number;
  uploadedAt: string;
  uploadedBy?: string | null;
};

export type PendingGlMeta = Omit<PendingGl, "fileBase64">;

export async function savePendingGl(g: PendingGl): Promise<void> {
  await storeJSON(PREFIX, ID, g);
}

export async function getPendingGl(): Promise<PendingGl | null> {
  return (await getJSON(PREFIX, ID)) as PendingGl | null;
}

/** Everything except the (large) base64 bytes — for the "ready to process" banner. */
export async function getPendingGlMeta(): Promise<PendingGlMeta | null> {
  const g = await getPendingGl();
  if (!g) return null;
  const { fileBase64, ...meta } = g;
  return meta;
}
