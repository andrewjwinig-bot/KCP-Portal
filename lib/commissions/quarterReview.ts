// Alison reviews each quarter's commission invoices BEFORE they go to
// AvidXchange (owner: "send the commissions to akorman … to review before
// sending to avid. give her a … link to send the invoices easily").
//
// At quarter-end the daily cron emails her every invoice awaiting review — the
// PDFs attached, the list in the body — with a signed link that opens them and
// sends them on in one click. Nothing reaches Avid until she approves it, and
// an approval covers exactly the invoices she was shown: a commission logged
// after she looked is put in front of her the next morning, never sent unseen.
// Once approved, the cron finishes any send that failed part-way, and Marie's
// memo + GL import goes out (it waits for the approval too, so payroll and the
// GL get the figures that were billed).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { isMailConfigured, sendMail, type MailAttachment } from "@/lib/mail";
import { portalOrigin } from "@/lib/linkOrigin";
import { invoiceNumberFor } from "@/lib/pdf/renderCommissionInvoicePdf";
import { canonicalQuarter } from "@/lib/commissions";
import {
  deliveredEntryIds, invoiceFileName, quarterInvoiceRows, renderQuarterInvoice,
  sendQuarterToAvidBill, sentTheOldWay, type QuarterInvoiceRow,
} from "./sendQuarterToAvidBill";
import { sendQuarterMemoToKorman } from "./sendQuarterMemo";
import { commissionReviewSecret, signCommissionReviewToken } from "./reviewLink";

const PREFIX = "commissions";
const REVIEW_ID = "review-log";

/** Who reviews the quarter. `COMMISSION_REVIEW_TO` overrides it without a deploy. */
export function reviewerEmail(): string {
  return (process.env.COMMISSION_REVIEW_TO ?? "").trim() || "akorman@kormancommercial.com";
}
export const REVIEWER_NAME = "Alison Korman";

type ReviewRecord = {
  requests: { at: string; to: string; ids: string[] }[];
  approvals: { at: string; by: string; ids: string[] }[];
};
type ReviewLog = Record<string, ReviewRecord>;

async function loadLog(): Promise<ReviewLog> {
  const raw = await getJSON(PREFIX, REVIEW_ID);
  return (raw && typeof raw === "object" ? raw : {}) as ReviewLog;
}
function recordOf(log: ReviewLog, q: string): ReviewRecord {
  return log[q] ?? { requests: [], approvals: [] };
}

export type ReviewInvoice = {
  id: string; invoiceNumber: string; fileName: string; kind: "office" | "retail";
  building: string; suite: string; tenant: string; amount: number;
  status: "sent" | "approved" | "awaiting";
};
export type QuarterReview = {
  quarterLabel: string;
  invoices: ReviewInvoice[];
  awaiting: number;
  /** Sent the old way (one email): nothing here is sent or reviewed again. */
  legacy: boolean;
  requestedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
};

/** The quarter as the reviewer sees it: every invoice, and whether it is sent,
 *  approved (the send is under way) or awaiting her. */
export async function quarterReview(quarterLabel: string): Promise<QuarterReview & { rows: QuarterInvoiceRow[] }> {
  quarterLabel = canonicalQuarter(quarterLabel);
  const [rows, log, legacy] = await Promise.all([quarterInvoiceRows(quarterLabel), loadLog(), sentTheOldWay(quarterLabel)]);
  const delivered = await deliveredEntryIds(quarterLabel, rows);
  const rec = recordOf(log, quarterLabel);
  const approved = new Set(rec.approvals.flatMap((a) => a.ids));
  const invoices: ReviewInvoice[] = rows.map((r) => ({
    id: r.entry.id, invoiceNumber: invoiceNumberFor(r.entry.id), fileName: invoiceFileName(r.entry), kind: r.kind,
    building: r.entry.building ?? "", suite: r.entry.suite ?? "", tenant: r.entry.tenant ?? "", amount: r.amount,
    status: legacy || delivered.has(r.entry.id) ? "sent" : approved.has(r.entry.id) ? "approved" : "awaiting",
  }));
  const lastReq = rec.requests[rec.requests.length - 1];
  const lastApp = rec.approvals[rec.approvals.length - 1];
  return {
    quarterLabel, rows, invoices, legacy,
    awaiting: invoices.filter((i) => i.status === "awaiting").length,
    requestedAt: lastReq?.at ?? null, approvedAt: lastApp?.at ?? null, approvedBy: lastApp?.by ?? null,
  };
}

export async function reviewLinkFor(quarterLabel: string): Promise<string | null> {
  quarterLabel = canonicalQuarter(quarterLabel);
  const secret = commissionReviewSecret();
  if (!secret) return null;
  return `${portalOrigin()}/commissions-review/${await signCommissionReviewToken(secret, quarterLabel)}`;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Email the reviewer whatever is awaiting her that she has not been sent yet.
 *  `force` re-sends the whole awaiting list (a "remind me" from the page). */
export async function requestQuarterReview(quarterLabel: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; emailed: number; reason?: string }> {
  quarterLabel = canonicalQuarter(quarterLabel);
  const review = await quarterReview(quarterLabel);
  if (review.legacy) return { ok: true, emailed: 0, reason: "Sent the old way" };
  const log = await loadLog();
  const rec = recordOf(log, quarterLabel);
  const requested = new Set(rec.requests.flatMap((r) => r.ids));
  const awaiting = review.rows.filter((r) => review.invoices.find((i) => i.id === r.entry.id)?.status === "awaiting");
  const fresh = awaiting.filter((r) => !requested.has(r.entry.id));
  if (awaiting.length === 0 || (!opts.force && fresh.length === 0)) return { ok: true, emailed: 0 };
  if (!isMailConfigured()) return { ok: false, emailed: 0, reason: "Mail not configured" };
  const link = await reviewLinkFor(quarterLabel);
  if (!link) return { ok: false, emailed: 0, reason: "No signing secret (SITE_AUTH_SECRET)" };

  const attachments: MailAttachment[] = await Promise.all(awaiting.map(async (r) => ({
    name: invoiceFileName(r.entry), content: await renderQuarterInvoice(r), contentType: "application/pdf",
  })));
  const total = awaiting.reduce((s, r) => s + r.amount, 0);
  const late = rec.requests.length > 0;
  const lines = awaiting.map((r) =>
    `  ${invoiceNumberFor(r.entry.id)}  ${(r.entry.building || "—")} Suite ${r.entry.suite || "—"} — ${r.entry.tenant || "—"}  ${money(r.amount)}`);
  const to = reviewerEmail();
  const ok = await sendMail({
    to,
    subject: `${late ? "More " : ""}Leasing Commissions to approve — ${quarterLabel}: ${money(total)}`,
    textBody: [
      `Hello Alison,`,
      "",
      `${late ? "Commissions have been logged since your last review." : `${quarterLabel} has closed.`} The leasing commissions total ${money(total)} across ${awaiting.length} invoice${awaiting.length === 1 ? "" : "s"}, ready for your approval before they go to AvidXchange.`,
      "",
      `Total to approve: ${money(total)}`,
      "",
      "For reference (PDFs attached):",
      ...lines,
      "",
      `Approve and send to AvidXchange:`,
      link,
      "",
      "Nothing goes to AvidXchange until you approve it there.",
      "",
      "— Korman Commercial Properties",
    ].join("\n"),
    attachments,
    noLinkTracking: true,
  });
  if (!ok) return { ok: false, emailed: 0, reason: "Send failed" };
  rec.requests.push({ at: new Date().toISOString(), to, ids: awaiting.map((r) => r.entry.id) });
  log[quarterLabel] = rec;
  await storeJSON(PREFIX, REVIEW_ID, log);
  return { ok: true, emailed: awaiting.length };
}

/** Approve the invoices the reviewer was SHOWN (`ids`) and send them to Avid,
 *  then the memo + GL import to Marie. Ids no longer awaiting are ignored. */
export async function approveQuarter(quarterLabel: string, by: string, ids: string[]) {
  quarterLabel = canonicalQuarter(quarterLabel);
  const review = await quarterReview(quarterLabel);
  if (review.legacy) return { ok: false as const, reason: "This quarter was already sent to AvidXchange the old way" };
  const awaiting = new Set(review.invoices.filter((i) => i.status === "awaiting").map((i) => i.id));
  const take = ids.filter((id) => awaiting.has(id));
  if (take.length > 0) {
    const log = await loadLog();
    const rec = recordOf(log, quarterLabel);
    rec.approvals.push({ at: new Date().toISOString(), by, ids: take });
    log[quarterLabel] = rec;
    await storeJSON(PREFIX, REVIEW_ID, log);
  }
  return { ok: true as const, approved: take.length, ...(await sendApproved(quarterLabel, `Approved by ${by}`)) };
}

/** Send every approved invoice not yet at Avid; once nothing awaits review,
 *  Marie's memo + GL import. Safe to repeat — neither sends anything twice. */
async function sendApproved(quarterLabel: string, by: string | null) {
  quarterLabel = canonicalQuarter(quarterLabel);
  const review = await quarterReview(quarterLabel);
  by = by ?? (review.approvedBy ? `Approved by ${review.approvedBy}` : "Automatic");
  const approved = review.invoices.filter((i) => i.status === "approved").map((i) => i.id);
  const avidBill = approved.length > 0
    ? await sendQuarterToAvidBill({ quarterLabel, by, onlyIds: approved })
    : null;
  const kormanMemo = review.invoices.length > 0 && review.awaiting === 0
    ? await sendQuarterMemoToKorman({ quarterLabel }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" }))
    : null;
  return { avidBill, kormanMemo };
}

/** The daily quarter-end run: finish approved sends, then ask for review of
 *  anything new. Nothing unapproved ever goes to Avid from here. */
export async function runQuarterEnd(quarterLabel: string) {
  quarterLabel = canonicalQuarter(quarterLabel);
  if (await sentTheOldWay(quarterLabel)) return { quarterLabel, legacy: true };
  const sent = await sendApproved(quarterLabel, null);
  const review = await requestQuarterReview(quarterLabel);
  return { quarterLabel, ...sent, review };
}
