// Durable audit trail of finalized move-out close-outs — the receivable-side
// counterpart to the Avid AP outbox. One record per finalized (property,
// unitRef, year); records who approved it, when, the reconciliation balance, the
// deposit settlement, and how many Skyline GL rows were produced.

import "server-only";
import { getJSON, storeJSON, listJSON } from "@/lib/storage";
import type { CloseOutKind } from "./queue";

const PREFIX = "moveout-send-log";
const idFor = (key: string) => key.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";

export type MoveoutSendEntry = {
  key: string;
  property: string;
  propertyName: string;
  unitRef: string;
  name: string;
  kind: CloseOutKind;
  year: number;
  /** Reconciliation balance: + owed by tenant, − credit/refund. */
  balance: number;
  /** Deposit on file at finalize (null when none). */
  deposit: number | null;
  /** Net settlement: >0 refund to tenant, <0 still due (null when N/A). */
  net: number | null;
  finalizedAt: string;
  finalizedBy: string | null;
  /** Non-zero Skyline charge rows produced (CAM/INS/RET). */
  glRows: number;
  /** True when the finalize email actually went out. */
  emailed: boolean;
};

export async function recordMoveoutSend(entry: MoveoutSendEntry): Promise<void> {
  await storeJSON(PREFIX, idFor(entry.key), entry);
}

export async function listMoveoutSends(limit = 40): Promise<MoveoutSendEntry[]> {
  const all = ((await listJSON(PREFIX)) as MoveoutSendEntry[]) ?? [];
  return all
    .filter((e) => e && e.finalizedAt)
    .sort((a, b) => (a.finalizedAt < b.finalizedAt ? 1 : -1))
    .slice(0, limit);
}
