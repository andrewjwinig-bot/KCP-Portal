// Receipt Reconciliation records — one per tenant payment Tami works.
//
//   draft    → worked out, not yet emailed
//   waiting  → emailed; the tenant has until `respondByISO` to say otherwise
//   apply    → (computed) the deadline passed with no answer, or the tenant
//              answered and the plan was confirmed — key it in Skyline
//   posted   → keyed in Skyline
//
// A record of what to key, not a posting — the portal never moves money.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { Explanation } from "./receiptMatch";

export type ReceiptStatus = "draft" | "waiting" | "apply" | "posted";

export type ReceiptRec = {
  id: string;
  period: string;
  unitRef: string;
  tenantName: string;
  propertyCode: string;
  amount: number;
  receivedISO: string;
  checkNo: string | null;
  plan: Explanation;
  /** `from` — the address it actually went from (Tami's, or the portal's
   *  verified sender when Postmark refused hers). */
  email: { to: string[]; subject: string; body: string; sentAt: string; sentBy: string | null; from?: string; attachedStatement?: boolean; messageId?: string | null; archiveId?: string } | null;
  /** Every send of this receipt, oldest first — ids in the sent-email archive
   *  (`receiptEmailLog.ts`), which keeps each exactly as it went. */
  emailIds?: string[];
  respondByISO: string | null;
  /** The tenant answered — what they said, and the plan confirmed from it. */
  reply: { at: string; by: string | null; note: string } | null;
  confirmedAt: string | null;
  postedAt: string | null;
  postedBy: string | null;
  createdAt: string;
  createdBy: string | null;
};

const store = createCollectionStore<ReceiptRec>({ prefix: "tenant-receipt-recs", keyOf: (r) => r.id });

export async function allReceipts(): Promise<ReceiptRec[]> {
  return (await store.all()).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getReceipt(id: string): Promise<ReceiptRec | null> { return store.get(id); }
export async function saveReceipt(r: ReceiptRec): Promise<void> { await store.set(r.id, r); }
export async function deleteReceipt(id: string): Promise<void> { await store.remove(id); }

/** Today in Eastern time, YYYY-MM-DD. */
export function todayET(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Where a record stands. A waiting record whose deadline has passed (the day
 *  AFTER `respondByISO`, Eastern) applies itself — no answer means the plan in
 *  the email stands. */
export function receiptStatus(r: Pick<ReceiptRec, "email" | "respondByISO" | "confirmedAt" | "postedAt">, now = new Date()): ReceiptStatus {
  if (r.postedAt) return "posted";
  if (r.confirmedAt) return "apply";
  if (!r.email) return "draft";
  if (r.respondByISO && todayET(now) > r.respondByISO) return "apply";
  return "waiting";
}
