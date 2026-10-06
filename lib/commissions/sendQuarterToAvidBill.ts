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
import { renderCommissionInvoicePdf, invoiceNumberFor, commissionInvoiceNumber, COMMISSION_VENDOR_CODE } from "@/lib/pdf/renderCommissionInvoicePdf";
import type { CommissionEntry } from "@/lib/commissions";
import { canonicalQuarter, parseQuarterLabel, quarterShortCode } from "@/lib/commissions";

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

/** The invoice number ("Q3-26 Int Com - 5-113") leads, then the tenant — the
 *  per-invoice "already sent" ledger keys on it. */
export function invoiceFileName(entry: CommissionEntry): string {
  return `${safeName(commissionInvoiceNumber(entry))} - ${safeName(entry.tenant) || "—"}.pdf`;
}

/** The filename invoices carried before the "Q3-26 Int Com" numbers (a hashed
 *  8-digit number). The ledger of a quarter sent then is keyed by it, so an
 *  invoice already delivered under it is never sent a second time. */
export function legacyInvoiceFileName(entry: CommissionEntry): string {
  return `${invoiceNumberFor(entry.id)} - ${safeName(entry.building) || "—"} - ${safeName(entry.suite) || "—"} - ${safeName(entry.tenant) || "—"}.pdf`;
}

/** Whether a quarter's ledger already holds this invoice, under either name. */
export function inLedger(invoices: Record<string, string>, entry: CommissionEntry): boolean {
  return !!(invoices[invoiceFileName(entry)] || invoices[legacyInvoiceFileName(entry)]);
}

/** The most recently completed quarter as of the supplied date, in the label
 *  the pages save ("Q3 26"). Jan-Mar → Q4 of prior year, Apr-Jun → Q1, etc. */
export function priorQuarterLabel(reference: Date = new Date()): string {
  const m = reference.getMonth(); // 0-indexed
  const y = reference.getFullYear();
  const [q, year] = m <= 2 ? [4, y - 1] : m <= 5 ? [1, y] : m <= 8 ? [2, y] : [3, y];
  return `Q${q} ${String(year).slice(-2)}`;
}

/** The send-log record for a quarter, under either label shape (records
 *  written before labels were canonical are keyed "3rd Quarter 2026"). */
export function sentRecordFor<T>(log: Record<string, T>, quarterLabel: string): T | undefined {
  const want = canonicalQuarter(quarterLabel);
  const key = Object.keys(log).find((k) => canonicalQuarter(k) === want);
  return key ? log[key] : undefined;
}

export type QuarterInvoiceRow = { entry: CommissionEntry; amount: number; kind: "office" | "retail" };

/** Every commission logged in the quarter (office + retail), with the amount
 *  it is billed at — the ONE list the Avid send and Alison's review read. */
export async function quarterInvoiceRows(quarterLabel: string): Promise<QuarterInvoiceRow[]> {
  const [office, retail] = await Promise.all([
    loadEntries(COMMISSIONS_PREFIX, OFFICE_ID),
    loadEntries(COMMISSIONS_PREFIX, RETAIL_ID),
  ]);
  return [
    ...office.filter((e) => canonicalQuarter(e.quarter) === canonicalQuarter(quarterLabel)).map((entry) => ({ entry, amount: billableAmount(entry, "office"), kind: "office" as const })),
    ...retail.filter((e) => canonicalQuarter(e.quarter) === canonicalQuarter(quarterLabel)).map((entry) => ({ entry, amount: billableAmount(entry, "retail"), kind: "retail" as const })),
  ];
}

/** The invoice PDF for one row — the same bytes Avid receives. */
export async function renderQuarterInvoice(row: QuarterInvoiceRow): Promise<Uint8Array> {
  return renderCommissionInvoicePdf({ entry: row.entry, amount: row.amount, invoiceNumber: commissionInvoiceNumber(row.entry) });
}

/** A quarter that went out the OLD way (one email, no per-invoice ledger) —
 *  never sent again, nor put up for review, without a person's `force`. */
export async function sentTheOldWay(quarterLabel: string): Promise<boolean> {
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return false;
  const [sentLog, ledger] = await Promise.all([loadSentLog(), getAvidSent("commissions", quarterShortCode(parsed.quarter, parsed.year))]);
  return !!sentRecordFor(sentLog, quarterLabel) && Object.keys(ledger.invoices).length === 0;
}

/** Which of the quarter's invoices have already reached AvidXchange, by entry id. */
export async function deliveredEntryIds(quarterLabel: string, rows: QuarterInvoiceRow[]): Promise<Set<string>> {
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return new Set();
  const ledger = await getAvidSent("commissions", quarterShortCode(parsed.quarter, parsed.year));
  return new Set(rows.filter((r) => inLedger(ledger.invoices, r.entry)).map((r) => r.entry.id));
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
  /** Who released it, for the AP Outbox — "Automatic" from the daily cron. */
  by?: string | null;
  /** Send ONLY these entries — the ones Alison approved. Omitted = all. */
  onlyIds?: string[];
}): Promise<SendResult> {
  const { dryRun = false, force = false, by = null, onlyIds } = opts;
  const quarterLabel = canonicalQuarter(opts.quarterLabel);
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) {
    return { ok: false, quarterLabel, count: 0, total: 0, reason: "Unparseable quarter" };
  }
  const code = quarterShortCode(parsed.quarter, parsed.year);

  const [sentLog, ledger] = await Promise.all([loadSentLog(), getAvidSent("commissions", code)]);
  // Sent before invoices went one per email: there is no per-invoice record,
  // so nothing can tell which invoices Avid actually took. Never re-send it
  // on its own — that is a person's call (`force`), after checking with AP.
  const prior = sentRecordFor(sentLog, quarterLabel);
  if (!force && prior && Object.keys(ledger.invoices).length === 0) {
    return {
      ok: true, quarterLabel, count: prior.count, total: prior.total,
      alreadySent: true,
    };
  }

  const all = await quarterInvoiceRows(quarterLabel);
  const only = onlyIds ? new Set(onlyIds) : null;
  const rows = only ? all.filter((r) => only.has(r.entry.id)) : all;

  if (rows.length === 0) {
    return { ok: true, quarterLabel, count: 0, total: 0, reason: "No commissions logged for that quarter" };
  }

  const pending = rows.filter((r) => !inLedger(ledger.invoices, r.entry));
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
  const invoices = await Promise.all(rows.map(async (row) => {
    const { entry } = row;
    const bytes = await renderQuarterInvoice(row);
    return {
      propertyLabel: `${commissionInvoiceNumber(entry)} — ${entry.tenant || "—"} · Vendor ${COMMISSION_VENDOR_CODE}`,
      fileName: invoiceFileName(entry),
      pdf: Buffer.from(bytes),
    };
  }));

  // The team summary's "by building" table.
  const byBuilding = new Map<string, number>();
  for (const r of rows) byBuilding.set(r.entry.building || "—", (byBuilding.get(r.entry.building || "—") ?? 0) + r.amount);
  const byProperty = [...byBuilding].map(([code, amount]) => ({ code, name: "Leasing Commissions", amount }));

  const res = await deliverInvoicesToAvid({
    by,
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

  // The quarter reads "sent" only once EVERY invoice in it is out — a partial,
  // approved-only send leaves the rest showing as awaiting review.
  const delivered = await deliveredEntryIds(quarterLabel, all);
  if (all.some((r) => !delivered.has(r.entry.id))) return { ok: true, quarterLabel, count: rows.length, total };
  sentLog[quarterLabel] = { sentAt: new Date().toISOString(), count: all.length, total: all.reduce((s, r) => s + r.amount, 0) };
  await storeJSON(COMMISSIONS_PREFIX, SENT_LOG_ID, sentLog);

  return { ok: true, quarterLabel, count: rows.length, total };
}
