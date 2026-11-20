// Every Receipt Reconciliation email, kept EXACTLY as it was sent — the
// rendered HTML and text, every recipient, the address it went from, the
// Postmark message ID and the statement PDF that rode along (owner, 11/2026:
// "record and save all sent emails … so that we have a proof and a record in
// the portal that we did request a response from the tenant").
//
// Its own collection, one record per send, written once and never edited —
// and NOT deleted with the receipt record: the proof that we asked outlives a
// receipt someone tidies away.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";

export type SentReceiptEmail = {
  id: string;
  receiptId: string;
  period: string;
  unitRef: string;
  tenantName: string;
  propertyCode: string;
  amount: number;
  planTitle: string;
  respondByISO: string | null;
  sentAt: string;
  sentBy: string | null;
  /** The full From header as sent ("Tami Tomlinson, … <ttomlinson@…>"). */
  from: string;
  to: string[];
  bcc: string | null;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  /** Postmark's id — look the message up in Postmark's Activity to see its
   *  delivery / open events. */
  messageId: string | null;
  /** Sent through Postmark's test token — nothing actually left. */
  testMode: boolean;
  attachment: { name: string; contentType: string; size: number; base64: string } | null;
};

/** The archive without the bytes — for lists. */
export type SentReceiptEmailSummary = Omit<SentReceiptEmail, "html" | "text" | "attachment"> & { attachmentName: string | null };

const store = createCollectionStore<SentReceiptEmail>({ prefix: "tenant-receipt-emails", keyOf: (r) => r.id });

export async function recordSentEmail(e: SentReceiptEmail): Promise<void> { await store.set(e.id, e); }
export async function getSentEmail(id: string): Promise<SentReceiptEmail | null> { return store.get(id); }

export function summarizeSent(e: SentReceiptEmail): SentReceiptEmailSummary {
  const { html: _h, text: _t, attachment, ...rest } = e;
  return { ...rest, attachmentName: attachment?.name ?? null };
}

export async function allSentEmails(): Promise<SentReceiptEmailSummary[]> {
  return (await store.all()).filter(Boolean).map(summarizeSent).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}
