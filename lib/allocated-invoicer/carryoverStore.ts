// Server-only persistence for the allocated-invoicer carryover ledger.
// One blob holds the whole ledger (small: at most one entry per property, each
// with a handful of held accounts).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptyLedger, type CarryoverLedger } from "./carryover";

const PREFIX = "alloc-carryover";
const ID = "ledger";

/** The ledger. It decides what has already been BILLED, so a read that comes
 *  back empty is retried, and once a ledger has ever been saved a miss THROWS
 *  rather than reading as "nothing billed" — that would bill every month from
 *  January again, the 10/19 shape (bug audit 11/2026). */
export async function getAllocLedger(): Promise<CarryoverLedger> {
  const l = (await getJSON(PREFIX, ID, { retryOnMiss: true })) as CarryoverLedger | null;
  if (!l) {
    const exists = await getJSON(PREFIX, EXISTS_ID, { retryOnMiss: true }).catch(() => null);
    if (exists) throw new Error("The allocated-expense ledger could not be read — nothing is billed until it can be.");
    return emptyLedger();
  }
  return {
    balances: l.balances ?? {},
    committedPeriods: Array.isArray(l.committedPeriods) ? l.committedPeriods : [],
    // The per-month "already billed" baselines. They were dropped here, so every
    // committed month read as un-baselined, was backfilled and skipped — the
    // late-charge catch-up never ran (found 10/20/26).
    recognized: l.recognized ?? {},
    recognizedMonths: Array.isArray(l.recognizedMonths) ? l.recognizedMonths : [],
    ...(l.billAllOnNextSend ? { billAllOnNextSend: true } : {}),
    updatedAt: l.updatedAt ?? "",
  };
}

const EXISTS_ID = "ledger-exists";

export async function saveAllocLedger(ledger: CarryoverLedger): Promise<void> {
  await storeJSON(PREFIX, ID, ledger);
  await storeJSON(PREFIX, EXISTS_ID, { since: new Date().toISOString() }).catch(() => {});
}

/** A dated copy of the ledger, taken before any repair rewrites it. */
export async function backupAllocLedger(ledger: CarryoverLedger, tag: string): Promise<string> {
  const id = `${ID}-backup-${tag}`;
  await storeJSON(PREFIX, id, ledger);
  return id;
}

/** A backup taken by `backupAllocLedger`, read back as stored. */
export async function getAllocLedgerBackup(id: string): Promise<CarryoverLedger | null> {
  return ((await getJSON(PREFIX, id)) as CarryoverLedger | null) ?? null;
}
