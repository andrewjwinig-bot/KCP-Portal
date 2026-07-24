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

// Idempotent label remapping. We started with informal labels like
// "LIK - Operating" / "Clearing" in the seed; once the From/To dropdowns
// were wired to UNIQUE_BANK_ACCOUNTS, the canonical labels became
// "JPM 2010 Operating (x9629)" and "JPM 2000 CLEAR (x1622)". Anything
// still using the legacy strings is rewritten on first read after this
// deploys, then persisted so the migration only runs once.
const LEGACY_LABEL_MAP: Record<string, string> = {
  "LIK - Operating":  "JPM 2010 Operating (x9629)",
  "Clearing":         "JPM 2000 CLEAR (x1622)",
  "Bellaire Ave":     "KH 509 9800 (x7857)",
  "Spring Garden St": "JPM 9820 (x2296)",
};

function remapLabel(s: string): string {
  return LEGACY_LABEL_MAP[s] ?? s;
}

function migrateLabels(transfers: BankTransfer[]): { transfers: BankTransfer[]; changed: boolean } {
  let changed = false;
  const next = transfers.map((t) => {
    const from = remapLabel(t.fromLabel);
    const to = remapLabel(t.toLabel);
    if (from !== t.fromLabel || to !== t.toLabel) {
      changed = true;
      return { ...t, fromLabel: from, toLabel: to };
    }
    return t;
  });
  return { transfers: next, changed };
}

async function loadManifest(): Promise<Manifest> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.transfers) && m.seeded) {
    const { transfers, changed } = migrateLabels(m.transfers);
    const next: Manifest = {
      transfers,
      shareFolderUrl: m.shareFolderUrl ?? DEFAULT_SHARE_FOLDER_URL,
      seeded: true,
      updatedAt: changed ? new Date().toISOString() : m.updatedAt,
    };
    if (changed) await saveManifestRaw(next);
    return next;
  }
  const seeded = migrateLabels(BANK_TRANSFERS_SEED()).transfers;
  const next: Manifest = {
    transfers: seeded,
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
