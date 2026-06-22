// Server-only persistence for the credit-card invoicer carryover ledger.
// One blob holds the whole ledger (small: at most one entry per property).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptyLedger, type CarryoverLedger } from "./carryover";

const PREFIX = "cc-carryover";
const ID = "ledger";

export async function getLedger(): Promise<CarryoverLedger> {
  const l = (await getJSON(PREFIX, ID)) as CarryoverLedger | null;
  if (!l) return emptyLedger();
  return {
    balances: l.balances ?? {},
    committedPeriods: Array.isArray(l.committedPeriods) ? l.committedPeriods : [],
    updatedAt: l.updatedAt ?? "",
  };
}

export async function saveLedger(ledger: CarryoverLedger): Promise<void> {
  await storeJSON(PREFIX, ID, ledger);
}
