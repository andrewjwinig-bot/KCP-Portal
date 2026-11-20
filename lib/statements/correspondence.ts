// Every email we have sent a tenant, as ONE timeline per suite (owner,
// 11/2026: "see on the tenants page if they have open charges what our last
// correspondence to them was … keep better data on when and what we sent
// them"). Pure: the store and the routes feed it.
//
// Three sources, merged:
//   • the correspondence log (`tenant-correspondence`) — every send from the
//     portal-link, allocation-request and balance-reminder routes;
//   • the receipt-email archive (`tenant-receipt-emails`) — kept by the
//     receipts route, the exact email as it went;
//   • allocation requests sent before the log existed (`askedAt` on the
//     request) — their wording was never kept, so they read as a summary.

export type CorrespondenceKind = "receipt" | "allocation-request" | "portal-link" | "balance-reminder" | "credit-notice" | "monthly-notice" | "credit-applied";

export const KIND_LABEL: Record<CorrespondenceKind, string> = {
  receipt: "Receipt email",
  "allocation-request": "Payment allocation request",
  "portal-link": "Portal link",
  "balance-reminder": "Balance reminder",
  "credit-notice": "Open credit notice",
  "monthly-notice": "Monthly account notice",
  "credit-applied": "Credit applied confirmation",
};

/** One email as the log stores it. `html` / `text` / attachment are kept so
 *  the email can be shown and downloaded as sent. */
export type TenantEmailRecord = {
  id: string;
  kind: CorrespondenceKind;
  unitRef: string;
  propertyCode: string;
  tenantName: string;
  sentAt: string;
  sentBy: string | null;
  from: string | null;
  to: string[];
  bcc: string | null;
  replyTo: string | null;
  subject: string;
  text: string;
  html: string | null;
  messageId: string | null;
  testMode: boolean;
  attachment: { name: string; contentType: string; size: number; base64: string } | null;
  /** A short line for the roster: "$1,250.00 received · applied to Nov rent". */
  summary: string | null;
  /** The allocation request / receipt this send belongs to. */
  refId: string | null;
  /** The balance the email was about, when it was about one. */
  balance: number | null;
};

/** What lists carry — no bodies, no bytes. `source` says where to open it. */
export type CorrespondenceEntry = {
  id: string;
  source: "log" | "receipt" | "allocation";
  kind: CorrespondenceKind;
  unitRef: string;
  tenantName: string;
  sentAt: string;
  sentBy: string | null;
  to: string[];
  subject: string;
  summary: string | null;
  /** The body was kept — it can be opened as sent. */
  viewable: boolean;
  testMode: boolean;
};

type ReceiptArchiveLike = {
  id: string; unitRef: string; tenantName: string; sentAt: string; sentBy: string | null; to: string[];
  subject: string; amount: number; planTitle: string; testMode: boolean;
};
type AllocationLike = {
  id: string; unitRef: string; tenantName: string; amount: number; askedAt: string | null; askedTo: string[];
  createdBy: string | null; paymentRef: string;
};

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const unitKey = (u: string) => u.trim().toUpperCase();

export function entryOf(r: TenantEmailRecord): CorrespondenceEntry {
  return {
    id: r.id, source: "log", kind: r.kind, unitRef: r.unitRef, tenantName: r.tenantName, sentAt: r.sentAt, sentBy: r.sentBy,
    to: r.to, subject: r.subject, summary: r.summary, viewable: !!(r.html || r.text), testMode: r.testMode,
  };
}

/** Every email, newest first. A receipt or allocation request the log already
 *  carries (by `refId`) is not listed twice. */
export function mergeCorrespondence(log: TenantEmailRecord[], receipts: ReceiptArchiveLike[], allocations: AllocationLike[]): CorrespondenceEntry[] {
  const logged = new Set(log.map((r) => r.refId).filter(Boolean) as string[]);
  const out: CorrespondenceEntry[] = log.map(entryOf);
  for (const e of receipts) {
    if (logged.has(e.id)) continue;
    out.push({
      id: e.id, source: "receipt", kind: "receipt", unitRef: e.unitRef, tenantName: e.tenantName, sentAt: e.sentAt, sentBy: e.sentBy,
      to: e.to, subject: e.subject, summary: `${usd(e.amount)} received · ${e.planTitle}`, viewable: true, testMode: e.testMode,
    });
  }
  for (const a of allocations) {
    if (!a.askedAt || logged.has(a.id)) continue;
    out.push({
      id: a.id, source: "allocation", kind: "allocation-request", unitRef: a.unitRef, tenantName: a.tenantName, sentAt: a.askedAt,
      sentBy: a.createdBy, to: a.askedTo, subject: `We received your payment of ${usd(a.amount)} — which charges should it cover?`,
      summary: `${usd(a.amount)} received${a.paymentRef ? ` (${a.paymentRef})` : ""}`, viewable: false, testMode: false,
    });
  }
  return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export type LastContact = { last: CorrespondenceEntry; count: number };

/** The newest email per suite, and how many there have been. */
export function lastContactByUnit(entries: CorrespondenceEntry[]): Record<string, LastContact> {
  const out: Record<string, LastContact> = {};
  for (const e of entries) { // newest first
    const k = unitKey(e.unitRef);
    if (out[k]) out[k].count++;
    else out[k] = { last: e, count: 1 };
  }
  return out;
}

/** Whole days since the last contact, for "12 days ago" and the follow-up flag. */
export function daysSince(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** A tenant who owes and has not heard from us in this long is due a follow-up. */
export const FOLLOW_UP_DAYS = 30;
