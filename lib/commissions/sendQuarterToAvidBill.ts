// Quarterly send to AvidXchange — one PDF invoice per commission logged in the
// target quarter (office + retail combined), delivered through the SAME shared
// sender every other invoicer uses (`deliverInvoicesToAvid`): each invoice is
// its OWN email with a single PDF, because Avid ingests one invoice per email
// and never opens a zip. It used to attach every PDF to ONE email, so Avid saw
// only the first. Marie gets one summary email (cc Drew and Harry); the memo +
// GL import files still go to her separately (sendQuarterMemo). Retry-safe: an
// invoice that already went out is never re-sent, and the quarter is marked
// sent only once every invoice and the summary are out. Invoked by
// /api/commissions/avidbill-quarter (button + the quarterly Vercel cron).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { isMailConfigured } from "@/lib/mail";
import { deliverInvoicesToAvid } from "@/lib/invoicing/avidDelivery";
import { getAvidSent } from "@/lib/invoicing/avidSentStore";
import { renderCommissionInvoicePdf, invoiceNumberFor } from "@/lib/pdf/renderCommissionInvoicePdf";
import type { CommissionEntry } from "@/lib/commissions";
import { parseQuarterLabel, quarterShortCode } from "@/lib/commissions";

const TEAM_CC = ["dwinig@kormancommercial.com", "hfeldman@kormancommercial.com"]; // Drew, Harry
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

/** The invoice number leads, so two commissions on the same suite and tenant
 *  can never share a filename — the per-invoice "already sent" ledger keys on it. */
function invoiceFileName(entry: CommissionEntry): string {
  return `${invoiceNumberFor(entry.id)} - ${safeName(entry.building) || "—"} - ${safeName(entry.suite) || "—"} - ${safeName(entry.tenant) || "—"}.pdf`;
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

/** Send the quarter's commission invoices to AvidXchange — only the ones that
 *  have not gone yet. Safe to run every day: a quarter whose invoices are all
 *  out is a no-op, a commission logged late goes on its own, and a run that
 *  failed part-way is finished by the next one. */
export async function sendQuarterToAvidBill(opts: {
  quarterLabel: string;
  dryRun?: boolean;
  /** Send a quarter that went out the OLD way (every PDF on one email). */
  force?: boolean;
}): Promise<SendResult> {
  const { quarterLabel, dryRun = false, force = false } = opts;
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) {
    return { ok: false, quarterLabel, count: 0, total: 0, reason: "Unparseable quarter" };
  }
  const code = quarterShortCode(parsed.quarter, parsed.year);

  const [sentLog, ledger] = await Promise.all([loadSentLog(), getAvidSent("commissions", code)]);
  // Sent before invoices went one per email: there is no per-invoice record,
  // so nothing can tell which invoices Avid actually took. Never re-send it
  // on its own — that is a person's call (`force`), after checking with AP.
  if (!force && sentLog[quarterLabel] && Object.keys(ledger.invoices).length === 0) {
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

  const pending = rows.filter((r) => !ledger.invoices[invoiceFileName(r.entry)]);
  if (pending.length === 0 && ledger.teamSummaryAt) {
    return { ok: true, quarterLabel, count: rows.length, total: rows.reduce((s, r) => s + r.amount, 0), alreadySent: true };
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (dryRun) {
    // The preview is what WILL go: the invoices not yet sent.
    return { ok: true, quarterLabel, count: pending.length, total: pending.reduce((s, r) => s + r.amount, 0), dryRun: true };
  }
  if (!isMailConfigured()) {
    return { ok: false, quarterLabel, count: rows.length, total, reason: "Mail not configured" };
  }

  // Render all PDFs in parallel — pure CPU, no I/O.
  const invoices = await Promise.all(rows.map(async ({ entry, amount }) => {
    const bytes = await renderCommissionInvoicePdf({
      entry,
      amount,
      invoiceNumber: invoiceNumberFor(entry.id),
    });
    return {
      propertyLabel: `${entry.building || "—"} Suite ${entry.suite || "—"} — ${entry.tenant || "—"}`,
      fileName: invoiceFileName(entry),
      pdf: Buffer.from(bytes),
    };
  }));

  // The team summary's "by building" table.
  const byBuilding = new Map<string, number>();
  for (const r of rows) byBuilding.set(r.entry.building || "—", (byBuilding.get(r.entry.building || "—") ?? 0) + r.amount);
  const byProperty = [...byBuilding].map(([code, amount]) => ({ code, name: "Leasing Commissions", amount }));

  const res = await deliverInvoicesToAvid({
    source: "commissions",
    label: "Leasing Commissions",
    period: code,
    invoices,
    byProperty,
    total,
    teamCc: TEAM_CC,
  });

  if (!res.allDelivered) {
    const out = res.avidSent + res.alreadySent;
    return {
      ok: false, quarterLabel, count: out, total,
      reason: `${out} of ${rows.length} invoices reached AvidXchange${res.teamNotified ? "" : " and the team summary did not go"} — send again to finish; nothing already sent goes twice`,
    };
  }

  sentLog[quarterLabel] = { sentAt: new Date().toISOString(), count: rows.length, total };
  await storeJSON(COMMISSIONS_PREFIX, SENT_LOG_ID, sentLog);

  return { ok: true, quarterLabel, count: rows.length, total };
}
