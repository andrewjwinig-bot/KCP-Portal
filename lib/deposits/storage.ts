// Server-only storage for security deposits.
//
// ONE BLOB PER DEPOSIT. The old single-manifest pattern did a read-modify-write
// of the whole list on every save, so the frequent auto-save (plus image
// uploads and the "+ add another check" flow) raced on that one blob and
// silently lost updates — deposits that looked saved would vanish on reload.
// Per-deposit blobs mean concurrent saves touch different keys and never clobber
// each other. The legacy manifest is migrated to per-deposit blobs on first read.

import "server-only";
import { getJSON, storeJSON, listJSON, deleteJSON } from "@/lib/storage";
import type { SecurityDeposit } from "./deposits";

const PREFIX = "security-deposits";
// Legacy single-manifest location ({ deposits: [...] }) — migrated on read.
const LEGACY_PREFIX = "security-deposits-manifest";
const LEGACY_ID = "all";

let migrated = false;

/** One-time migration: fan the legacy manifest's deposits out into per-deposit
 *  blobs, then drop the manifest so this stops running. Idempotent + safe to
 *  race across instances (existence-checked writes; the delete just no-ops the
 *  second time). */
async function migrateLegacy(): Promise<void> {
  if (migrated) return;
  try {
    const m = (await getJSON(LEGACY_PREFIX, LEGACY_ID)) as { deposits?: SecurityDeposit[] } | null;
    if (m && Array.isArray(m.deposits) && m.deposits.length) {
      for (const d of m.deposits) {
        if (d?.id && !(await getJSON(PREFIX, d.id))) await storeJSON(PREFIX, d.id, d);
      }
      await deleteJSON(LEGACY_PREFIX, LEGACY_ID);
    }
    migrated = true;
  } catch {
    // Don't cache a failed migration — retry on the next call.
  }
}

export async function listDeposits(): Promise<SecurityDeposit[]> {
  await migrateLegacy();
  return (await listJSON(PREFIX)) as SecurityDeposit[];
}

export async function getDeposit(id: string): Promise<SecurityDeposit | null> {
  await migrateLegacy();
  return ((await getJSON(PREFIX, id)) as SecurityDeposit | null) ?? null;
}

export async function saveDeposit(deposit: SecurityDeposit): Promise<SecurityDeposit> {
  await storeJSON(PREFIX, deposit.id, deposit);
  return deposit;
}

export async function deleteDeposit(id: string): Promise<boolean> {
  return deleteJSON(PREFIX, id);
}
