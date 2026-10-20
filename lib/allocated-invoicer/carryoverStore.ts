// Server-only persistence for the allocated-invoicer carryover ledger.
// One blob holds the whole ledger (small: at most one entry per property, each
// with a handful of held accounts).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptyLedger, type CarryoverLedger } from "./carryover";

const PREFIX = "alloc-carryover";
const ID = "ledger";

export async function getAllocLedger(): Promise<CarryoverLedger> {
  const l = (await getJSON(PREFIX, ID)) as CarryoverLedger | null;
  if (!l) return emptyLedger();
  return {
    balances: l.balances ?? {},
    committedPeriods: Array.isArray(l.committedPeriods) ? l.committedPeriods : [],
    // The per-month "already billed" baselines. They were dropped here, so every
    // committed month read as un-baselined, was backfilled and skipped — the
    // late-charge catch-up never ran (found 10/20/26).
    recognized: l.recognized ?? {},
    recognizedMonths: Array.isArray(l.recognizedMonths) ? l.recognizedMonths : [],
    updatedAt: l.updatedAt ?? "",
  };
}

export async function saveAllocLedger(ledger: CarryoverLedger): Promise<void> {
  await storeJSON(PREFIX, ID, ledger);
}

/** A dated copy of the ledger, taken before any repair rewrites it. */
export async function backupAllocLedger(ledger: CarryoverLedger, tag: string): Promise<string> {
  const id = `${ID}-backup-${tag}`;
  await storeJSON(PREFIX, id, ledger);
  return id;
}
