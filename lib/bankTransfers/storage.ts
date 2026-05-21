// Bank-transfers storage. Single-manifest pattern (one GET per page load,
// one GET+PUT per mutation). First read seeds the manifest with the
// historical transfer log so Harry / Drew open the page to populated data.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { BANK_TRANSFERS_SEED, DEFAULT_SHARE_FOLDER_URL } from "./seed";

export type BankTransfer = {
  id: string;
  date: string;          // ISO YYYY-MM-DD
  bankName: string;      // e.g. "Chase"
  fromLabel: string;     // free-text — account / fund / property
  toLabel: string;       // free-text
  amount: number;        // dollars
  pdfSaved: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
};

const MANIFEST_PREFIX = "bank-transfers-manifest";
const MANIFEST_ID = "all";

type Manifest = {
  transfers: BankTransfer[];
  shareFolderUrl: string;
  seeded: boolean;
  updatedAt: string;
};

async function loadManifest(): Promise<Manifest> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.transfers) && m.seeded) {
    return {
      transfers: m.transfers,
      shareFolderUrl: m.shareFolderUrl ?? DEFAULT_SHARE_FOLDER_URL,
      seeded: true,
      updatedAt: m.updatedAt,
    };
  }
  const transfers = BANK_TRANSFERS_SEED();
  const next: Manifest = {
    transfers,
    shareFolderUrl: DEFAULT_SHARE_FOLDER_URL,
    seeded: true,
    updatedAt: new Date().toISOString(),
  };
  await saveManifestRaw(next);
  return next;
}

async function saveManifestRaw(m: Manifest): Promise<void> {
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, m);
}

export async function listBankTransfers(): Promise<{ transfers: BankTransfer[]; shareFolderUrl: string }> {
  const m = await loadManifest();
  // Newest-first by date, then by createdAt as a tiebreaker.
  const sorted = [...m.transfers].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
  return { transfers: sorted, shareFolderUrl: m.shareFolderUrl };
}

export async function saveBankTransfer(t: BankTransfer): Promise<void> {
  const m = await loadManifest();
  const idx = m.transfers.findIndex((x) => x.id === t.id);
  const next: BankTransfer = { ...t, updatedAt: new Date().toISOString() };
  if (idx >= 0) m.transfers[idx] = next;
  else m.transfers.push(next);
  m.updatedAt = new Date().toISOString();
  await saveManifestRaw(m);
}

export async function removeBankTransfer(id: string): Promise<boolean> {
  const m = await loadManifest();
  const next = m.transfers.filter((x) => x.id !== id);
  if (next.length === m.transfers.length) return false;
  m.transfers = next;
  m.updatedAt = new Date().toISOString();
  await saveManifestRaw(m);
  return true;
}

export async function setShareFolderUrl(url: string): Promise<string> {
  const m = await loadManifest();
  m.shareFolderUrl = url.trim();
  m.updatedAt = new Date().toISOString();
  await saveManifestRaw(m);
  return m.shareFolderUrl;
}

export function newBankTransferId(): string {
  return "bt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
