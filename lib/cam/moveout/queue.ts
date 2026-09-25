// The move-out close-out queue — the durable state behind "auto-stage + one-click
// send". The daily watcher (lib/cam/moveout/watcher) upserts one entry per
// departing tenant and advances it through:
//
//   waiting  → detected a move-out, but the GL isn't posted through the vacate
//              month yet, so the final statement can't be computed. Re-checked
//              every watch; nothing is emailed.
//   ready    → the GL is fully posted for the occupied window. The final
//              statement is computed and staged, and the approver (Nancy for
//              office, Harry for retail, cc the user) is emailed ONCE to review
//              and approve. `notifiedAt` guards against re-emailing.
//   approved → someone clicked "Approve & finalize" (the one human touch). The
//              GL entry (Skyline charge) + final PDF are produced and delivered;
//              a durable record lands in the move-out send log.
//
// One entry per (property, unitRef, year), so re-imports and re-runs converge
// instead of duplicating.

import "server-only";
import { getJSON, storeJSON, listJSON } from "@/lib/storage";

const PREFIX = "moveout-closeout";

export type CloseOutStatus = "waiting" | "ready" | "approved";
export type CloseOutKind = "office" | "retail";

export type CloseOutDeposit = {
  amount: number;
  /** held | partial | refunded | forfeited */
  status: string;
  /** deposit − reconciliation balance: >0 refund to tenant, <0 still due. Null
   *  when the deposit no longer applies (already refunded / forfeited). */
  net: number | null;
};

export type CloseOut = {
  key: string; // `${property}-${unitRef}-${year}`
  property: string;
  propertyName: string;
  unitRef: string;
  suite: string;
  name: string;
  kind: CloseOutKind;
  year: number;
  /** The tenant's last occupied month in the recon year (1–12). */
  vacateMonth: number;
  leaseTo: string | null;
  status: CloseOutStatus;

  // Computed snapshot — refreshed on every watch while waiting/ready.
  balance: number; // + owed by tenant, − credit/refund
  occupiedMonths: number;
  unpostedMonths: number;
  maxPosted: number;

  // Security-deposit settlement, captured when the entry goes ready.
  deposit: CloseOutDeposit | null;

  // Lifecycle.
  detectedAt: string;
  readyAt: string | null;
  notifiedAt: string | null; // approval email sent
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string;
};

export function closeOutKey(property: string, unitRef: string, year: number): string {
  return `${property}-${unitRef}-${year}`;
}
const idFor = (key: string) => key.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";

export async function getCloseOut(key: string): Promise<CloseOut | null> {
  return (await getJSON(PREFIX, idFor(key))) as CloseOut | null;
}

/** Every queued close-out. Waiting/ready first (most actionable), then by newest
 *  activity. */
export async function listCloseOuts(): Promise<CloseOut[]> {
  const all = ((await listJSON(PREFIX)) as CloseOut[]) ?? [];
  const rank: Record<CloseOutStatus, number> = { ready: 0, waiting: 1, approved: 2 };
  return all
    .filter((c) => c && c.key)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || ((a.updatedAt < b.updatedAt) ? 1 : -1));
}

/** Create or update an entry, merging `patch` over the stored value (or over a
 *  fresh skeleton on first sight). Always bumps `updatedAt`. */
export async function upsertCloseOut(
  key: string,
  patch: Partial<CloseOut> & Pick<CloseOut, "property" | "unitRef" | "year">,
): Promise<CloseOut> {
  const now = new Date().toISOString();
  const existing = await getCloseOut(key);
  const base: CloseOut = existing ?? {
    key,
    property: patch.property,
    propertyName: patch.propertyName ?? patch.property,
    unitRef: patch.unitRef,
    suite: patch.suite ?? patch.unitRef.split("-").slice(1).join("-"),
    name: patch.name ?? patch.unitRef,
    kind: patch.kind ?? "office",
    year: patch.year,
    vacateMonth: patch.vacateMonth ?? 12,
    leaseTo: patch.leaseTo ?? null,
    status: "waiting",
    balance: 0,
    occupiedMonths: 0,
    unpostedMonths: 0,
    maxPosted: 0,
    deposit: null,
    detectedAt: now,
    readyAt: null,
    notifiedAt: null,
    approvedAt: null,
    approvedBy: null,
    updatedAt: now,
  };
  const merged: CloseOut = { ...base, ...patch, key, updatedAt: now };
  await storeJSON(PREFIX, idFor(key), merged);
  return merged;
}

/** Mark an entry approved (the one human touch). Idempotent — a second approve
 *  keeps the first approver/timestamp. */
export async function markApproved(key: string, by: string | null): Promise<CloseOut | null> {
  const existing = await getCloseOut(key);
  if (!existing) return null;
  if (existing.status === "approved") return existing;
  const now = new Date().toISOString();
  const merged: CloseOut = { ...existing, status: "approved", approvedAt: now, approvedBy: by, updatedAt: now };
  await storeJSON(PREFIX, idFor(key), merged);
  return merged;
}
