// Quarter-end commissions. The invoices go to AvidXchange AUTOMATICALLY, one
// per email — no approval step (owner, reversing the earlier review gate:
// "send the individual invoices to avid automatically without requiring
// alison to approve. send alison the pdf memo for her records"). Alison gets
// the memo afterwards as a record; Marie gets the memo + GL import.
//
// The review link (/commissions-review/[token]) and its approve path are kept
// so a link already emailed still opens — every invoice on it now reads SENT.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { isMailConfigured, sendMail, type MailAttachment } from "@/lib/mail";
import { portalOrigin } from "@/lib/linkOrigin";
import { commissionInvoiceNumber } from "@/lib/pdf/renderCommissionInvoicePdf";
import { canonicalQuarter, parseQuarterLabel, quarterShortCode, type CommissionEntry } from "@/lib/commissions";
import { buildCommissionMemoPdf, FUND_PROPERTY_CODE } from "./memoPdf";
import { buildRetailMemoPdf, RETAIL_PAYEE } from "./retailMemoPdf";
import { JE_FUNDS } from "./journalEntryExcel";
import {
  deliveredEntryIds, invoiceFileName, quarterInvoiceRows, renderQuarterInvoice,
  sendQuarterToAvidBill, sentTheOldWay, type QuarterInvoiceRow,
} from "./sendQuarterToAvidBill";
import { sendQuarterMemoToKorman } from "./sendQuarterMemo";
import { sendRetailEntry } from "./sendRetailEntry";
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
  /** When the memo went to Alison for her records (office / retail). */
  memoSentAt?: string;
  retailMemoSentAt?: string;
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
    id: r.entry.id, invoiceNumber: commissionInvoiceNumber(r.entry), fileName: invoiceFileName(r.entry), kind: r.kind,
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
    `  ${commissionInvoiceNumber(r.entry)} — ${r.entry.tenant || "—"}  ${money(r.amount)}`);
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

/** The memo PDFs, for Alison's records — the same memo Marie gets, without
 *  the GL import: the office memo (one per fund) or the Shopping Centers memo.
 *  Sent once per quarter per kind, AFTER the invoices are out: it is a record,
 *  never a step before Avid (owner). */
export async function sendMemoToAlison(quarterLabel: string, kind: "office" | "retail" = "office"): Promise<{ ok: boolean; alreadySent?: boolean; reason?: string }> {
  quarterLabel = canonicalQuarter(quarterLabel);
  const log = await loadLog();
  const rec = recordOf(log, quarterLabel);
  const stamp = kind === "office" ? "memoSentAt" : "retailMemoSentAt";
  if (rec[stamp]) return { ok: true, alreadySent: true };
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return { ok: false, reason: "Unparseable quarter" };
  const list: CommissionEntry[] = (await getJSON(PREFIX, kind === "office" ? "entries" : "entries-retail")) ?? [];
  const inQuarter = list.filter((e) => canonicalQuarter(e.quarter) === quarterLabel);
  if (inQuarter.length === 0) return { ok: false, reason: `No ${kind} commissions for quarter` };
  if (!isMailConfigured()) return { ok: false, reason: "Mail not configured" };
  const code = quarterShortCode(parsed.quarter, parsed.year);
  const attachments: MailAttachment[] = [];
  if (kind === "office") {
    for (const fund of JE_FUNDS) {
      const pdf = await buildCommissionMemoPdf({ quarter: quarterLabel, entries: inQuarter, parsed, fund });
      if (pdf) attachments.push({ name: `Commissions ${code} - ${FUND_PROPERTY_CODE[fund]} - Nancy L Fox.pdf`, content: pdf, contentType: "application/pdf" });
    }
  } else {
    const pdf = await buildRetailMemoPdf({ entries: inQuarter, parsed });
    attachments.push({ name: `Retail Commissions ${code} - ${RETAIL_PAYEE}.pdf`, content: pdf, contentType: "application/pdf" });
  }
  if (attachments.length === 0) return { ok: false, reason: "Nothing to attach" };
  const subtotal = inQuarter.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const what = kind === "office" ? "Leasing Commissions" : "Retail Leasing Commissions";
  const ok = await sendMail({
    to: reviewerEmail(),
    subject: `${what} ${quarterLabel} — memo for your records (${money(subtotal)})`,
    textBody: [
      `Hello Alison,`,
      ``,
      `For your records: the ${quarterLabel} ${kind === "office" ? "incentive compensation" : "Shopping Centers leasing commission"} memo${attachments.length === 1 ? " is" : "s are"} attached — ${inQuarter.length} commission${inQuarter.length === 1 ? "" : "s"}, ${money(subtotal)} before the 20% markup.`,
      `Each invoice has been sent to AvidXchange on its own; nothing is needed from you.`,
      ``,
      `— KCP Portal`,
    ].join("\n"),
    attachments,
  });
  if (!ok) return { ok: false, reason: "Send failed" };
  rec[stamp] = new Date().toISOString();
  log[quarterLabel] = rec;
  await storeJSON(PREFIX, REVIEW_ID, log);
  return { ok: true };
}

/** The quarter-end run (daily cron, and each page's "Send to AvidXchange"):
 *  every invoice not yet at Avid goes, one per email, with NO approval step
 *  (owner: "send the individual invoices to avid automatically without
 *  requiring alison to approve"). Then, per kind (office = Nancy's, retail =
 *  Harry's), the memo to Marie and the memo to Alison for her records. Each
 *  step is idempotent — nothing goes twice, and a commission logged late
 *  goes on the next run. `kind` limits it to one page's commissions. */
export async function runQuarterEnd(quarterLabel: string, by: string | null = null, kind?: "office" | "retail") {
  quarterLabel = canonicalQuarter(quarterLabel);
  if (await sentTheOldWay(quarterLabel)) return { quarterLabel, legacy: true as const };
  const kinds = (kind ? [kind] : ["office", "retail"]) as ("office" | "retail")[];
  // Office: the quarter's invoices together. Retail: each commission through
  // its own send (Avid → Marie's GL import → Harry's payroll email), which
  // normally ran when Harry saved it — this finishes any that did not.
  const avidBill = kinds.includes("office")
    ? await sendQuarterToAvidBill({ quarterLabel, by: by ?? "Automatic", kind: "office" })
    : null;
  const retailSends: Record<string, unknown> = {};
  if (kinds.includes("retail")) {
    const before = await quarterInvoiceRows(quarterLabel);
    for (const r of before.filter((x) => x.kind === "retail")) {
      retailSends[r.entry.id] = await sendRetailEntry(r.entry.id, by ?? "Automatic").catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" }));
    }
  }
  const rows = await quarterInvoiceRows(quarterLabel);
  const delivered = await deliveredEntryIds(quarterLabel, rows);
  const memos: Record<string, unknown> = {};
  for (const k of kinds) {
    const ofKind = rows.filter((r) => r.kind === k);
    // Memos follow the invoices: only once every one of this kind is at Avid.
    if (ofKind.length === 0 || ofKind.some((r) => !delivered.has(r.entry.id))) continue;
    memos[k] = {
      // Marie: the office memo + GL import; for retail (whose GL import she
      // gets per commission as it goes) the memo + control sheet, to check
      // the invoices against Avid.
      marie: await sendQuarterMemoToKorman({ quarterLabel, kind: k }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" })),
      alison: await sendMemoToAlison(quarterLabel, k).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" })),
    };
  }
  const retailCount = Object.keys(retailSends).length;
  return { quarterLabel, avidBill, retailSends: retailCount ? retailSends : undefined, memos };
}
