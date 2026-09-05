// Server-only persistence for the credit-card invoicer carryover ledger.
// One blob holds the whole ledger (small: at most one entry per property).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptyLedger, type CarryoverLedger } from "./carryover";
import { applyCarryoverSeeds } from "./carryoverSeed";

const PREFIX = "cc-carryover";
const ID = "ledger";

export async function getLedger(): Promise<CarryoverLedger> {
  const l = (await getJSON(PREFIX, ID)) as CarryoverLedger | null;
  const base: CarryoverLedger = l
    ? {
        balances: l.balances ?? {},
        committedPeriods: Array.isArray(l.committedPeriods) ? l.committedPeriods : [],
        appliedSeeds: Array.isArray(l.appliedSeeds) ? l.appliedSeeds : [],
        updatedAt: l.updatedAt ?? "",
      }
    : emptyLedger();
  // Apply one-time preload seeds; persist only when a seed is first applied.
  const { ledger, changed } = applyCarryoverSeeds(base, new Date().toISOString());
  if (changed) await saveLedger(ledger);
  return ledger;
}

export async function saveLedger(ledger: CarryoverLedger): Promise<void> {
  await storeJSON(PREFIX, ID, ledger);
}
