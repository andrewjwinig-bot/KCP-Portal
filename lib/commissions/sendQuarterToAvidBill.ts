// Quarterly batch-send to AvidBill — generates a PDF invoice per
// commission logged in the target quarter (office + retail combined),
// attaches them all to a single email, and persists a sent-record so
// reruns of the same quarter don't double-send. Invoked by
// /api/commissions/avidbill-quarter, which is in turn driven by the
// Vercel cron entry in vercel.json.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { renderCommissionInvoicePdf, invoiceNumberFor } from "@/lib/pdf/renderCommissionInvoicePdf";
import type { CommissionEntry } from "@/lib/commissions";
import { parseQuarterLabel, quarterShortCode } from "@/lib/commissions";

const AVIDBILL_TO = "kormancommercial@avidbill.com";
const COMMISSIONS_PREFIX = "commissions";
const OFFICE_ID = "entries";
const RETAIL_ID = "entries-retail";
const SENT_LOG_ID = "avidbill-sent";

const OFFICE_MARKUP = 1.2;

type SentLog = Record<string, { sentAt: string; count: number; total: number }>;

type SendResult = {
  ok: boolean;
  quarterLabel: string;
  count: number;
  total: number;
  alreadySent?: boolean;
  dryRun?: boolean;
  reason?: string;
};

function safeName(s: string): string {
  return (s ?? "").toString().replace(/[^a-z0-9\-_. ]/gi, "_").trim();
}

function invoiceFileName(entry: CommissionEntry): string {
  return `Invoice - ${safeName(entry.building) || "—"} - ${safeName(entry.suite) || "—"} - ${safeName(entry.tenant) || "—"}.pdf`;
}

function moneyStr(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Returns the most recently completed quarter as of the supplied
 *  date. Jan-Mar → Q4 of prior year, Apr-Jun → Q1 of this year, etc. */
export function priorQuarterLabel(reference: Date = new Date()): string {
  const m = reference.getMonth(); // 0-indexed
  const y = reference.getFullYear();
  let q: number;
  let year: number;
  if (m <= 2)       { q = 4; year = y - 1; }
  else if (m <= 5)  { q = 1; year = y; }
  else if (m <= 8)  { q = 2; year = y; }
  else              { q = 3; year = y; }
  // Match the long label staff use elsewhere — parseQuarterLabel
  // accepts both shapes but the page UI saves it long.
  const suffix = ["th", "st", "nd", "rd"][q] ?? "th";
  return `${q}${suffix} Quarter ${year}`;
}

async function loadEntries(prefix: string, id: string): Promise<CommissionEntry[]> {
  const list = await getJSON(prefix, id);
  return Array.isArray(list) ? (list as CommissionEntry[]) : [];
}

async function loadSentLog(): Promise<SentLog> {
  const raw = await getJSON(COMMISSIONS_PREFIX, SENT_LOG_ID);
  return (raw && typeof raw === "object" ? raw : {}) as SentLog;
}

function billableAmount(entry: CommissionEntry, kind: "office" | "retail"): number {
  const base = Number(entry.incentiveAmount) || 0;
  return kind === "office" ? base * OFFICE_MARKUP : base;
}

/** Render one PDF per logged commission for the target quarter,
 *  attach to one email, and persist a sent-record. */
export async function sendQuarterToAvidBill(opts: {
  quarterLabel: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<SendResult> {
  const { quarterLabel, dryRun = false, force = false } = opts;
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) {
    return { ok: false, quarterLabel, count: 0, total: 0, reason: "Unparseable quarter" };
  }

  const sentLog = await loadSentLog();
  if (!force && sentLog[quarterLabel]) {
    return {
      ok: true, quarterLabel, count: sentLog[quarterLabel].count, total: sentLog[quarterLabel].total,
      alreadySent: true,
    };
  }

  const [office, retail] = await Promise.all([
    loadEntries(COMMISSIONS_PREFIX, OFFICE_ID),
    loadEntries(COMMISSIONS_PREFIX, RETAIL_ID),
  ]);
  const rows: { entry: CommissionEntry; amount: number; kind: "office" | "retail" }[] = [
    ...office.filter((e) => e.quarter === quarterLabel).map((entry) => ({ entry, amount: billableAmount(entry, "office"), kind: "office" as const })),
    ...retail.filter((e) => e.quarter === quarterLabel).map((entry) => ({ entry, amount: billableAmount(entry, "retail"), kind: "retail" as const })),
  ];

  if (rows.length === 0) {
    return { ok: true, quarterLabel, count: 0, total: 0, reason: "No commissions logged for that quarter" };
  }

  // Render all PDFs in parallel — pure CPU, no I/O.
  const attachments = await Promise.all(rows.map(async ({ entry, amount }) => {
    const bytes = await renderCommissionInvoicePdf({
      entry,
      amount,
      invoiceNumber: invoiceNumberFor(entry.id),
    });
    return { name: invoiceFileName(entry), content: bytes, contentType: "application/pdf" };
  }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const code = quarterShortCode(parsed.quarter, parsed.year);
  const subject = `Korman Commercial — ${code} Leasing Commission Invoices (${rows.length})`;
  const textLines: string[] = [
    `Attached: ${rows.length} commission invoice${rows.length === 1 ? "" : "s"} for ${quarterLabel}.`,
    "",
    `Total billable: ${moneyStr(total)}`,
    "",
    "Each invoice carries the vendor LIKM4 and account code 1940-8501",
    "(Outside Leasing Commissions). Tenant, building/suite, lease window,",
    "and any comments are in the line description.",
    "",
    "— LIK Management Inc",
  ];

  if (dryRun) {
    return { ok: true, quarterLabel, count: rows.length, total, dryRun: true };
  }
  if (!isMailConfigured()) {
    return { ok: false, quarterLabel, count: rows.length, total, reason: "Mail not configured" };
  }

  const sent = await sendMail({
    to: AVIDBILL_TO,
    subject,
    textBody: textLines.join("\n"),
    attachments,
  });
  if (!sent) {
    return { ok: false, quarterLabel, count: rows.length, total, reason: "Postmark send failed" };
  }

  sentLog[quarterLabel] = { sentAt: new Date().toISOString(), count: rows.length, total };
  await storeJSON(COMMISSIONS_PREFIX, SENT_LOG_ID, sentLog);

  return { ok: true, quarterLabel, count: rows.length, total };
}
