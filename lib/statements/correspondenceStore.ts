// The tenant correspondence log — one record per email sent, written once.
// See `correspondence.ts` for how it is read beside the receipt archive.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import { allSentEmails, getSentEmail } from "./receiptEmailLog";
import { allAllocationRequests, getAllocationRequest } from "./allocationRequestStore";
import { mergeCorrespondence, type CorrespondenceEntry, type TenantEmailRecord } from "./correspondence";

const store = createCollectionStore<TenantEmailRecord>({ prefix: "tenant-correspondence", keyOf: (r) => r.id });

export function newCorrespondenceId(unitRef: string): string {
  return `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${unitRef}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Record a send. Never throws — an email that went must not read as failed
 *  because its record could not be written. */
export async function recordTenantEmail(r: TenantEmailRecord): Promise<void> {
  try { await store.set(r.id, r); }
  catch (e) { console.error(`[correspondence] ${r.kind} to ${r.unitRef} went but was not recorded`, e); }
}

export async function allCorrespondence(): Promise<CorrespondenceEntry[]> {
  const [log, receipts, allocations] = await Promise.all([
    store.all().then((a) => a.filter(Boolean)),
    allSentEmails().catch(() => []),
    allAllocationRequests().catch(() => []),
  ]);
  return mergeCorrespondence(log, receipts, allocations);
}

export async function correspondenceForUnit(unitRef: string): Promise<CorrespondenceEntry[]> {
  const k = unitRef.trim().toUpperCase();
  return (await allCorrespondence()).filter((e) => e.unitRef.toUpperCase() === k);
}

/** One email in full, whatever its source, in the archive's shape. */
export type FullEmail = {
  id: string; kind: CorrespondenceEntry["kind"]; unitRef: string; tenantName: string; sentAt: string; sentBy: string | null;
  from: string | null; to: string[]; bcc: string | null; replyTo: string | null; subject: string;
  html: string | null; text: string | null; messageId: string | null; testMode: boolean;
  attachment: { name: string; contentType: string; base64: string } | null; respondByISO: string | null; summary: string | null;
};

export async function fullEmail(source: string, id: string): Promise<FullEmail | null> {
  if (source === "receipt") {
    const e = await getSentEmail(id);
    return e ? { ...e, kind: "receipt", respondByISO: e.respondByISO, summary: e.planTitle } : null;
  }
  if (source === "allocation") {
    const a = await getAllocationRequest(id);
    if (!a?.askedAt) return null;
    return {
      id: a.id, kind: "allocation-request", unitRef: a.unitRef, tenantName: a.tenantName, sentAt: a.askedAt, sentBy: a.createdBy,
      from: null, to: a.askedTo, bcc: null, replyTo: null, subject: "Payment allocation request", html: null,
      text: null, messageId: null, testMode: false, attachment: null, respondByISO: null,
      summary: "Sent before the portal kept the wording of these emails.",
    };
  }
  const r = await store.get(id);
  return r ? { ...r, respondByISO: null } : null;
}
