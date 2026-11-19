// INVOICE HISTORY — every batch that went to AvidXchange, all four flows, and
// the PDFs AS SENT (owner, 11/2026: "give tanya all invoice history"; she
// processes the invoices in Avid). One reader over the stores each flow
// already keeps — nothing new is written:
//
//   the batches      the AP send log (`avid-send-log`), one per flow + period
//   Credit Card,     the sent-invoice archive (`sent-invoice-archive`),
//   Payroll          written by /api/avid-send
//   Allocated        the allocated archive (`invoiceArchive.ts`), written at
//                    send — or a copy REBUILT from the GL, marked as such
//   Commissions      the as-sent snapshots (`commissions/history`), drawn by
//                    the same renderer the send used, so the bytes match
//
// A batch sent before its archive existed lists no PDFs and says so.

import "server-only";
import { listAvidSends, type AvidSendEntry, type AvidSource } from "./avidSendLog";
import { getSentInvoiceArchive } from "./sentInvoiceArchive";
import { getInvoiceArchive } from "@/lib/allocated-invoicer/invoiceArchive";
import { loadCommissionHistory, type HistoryInvoice } from "@/lib/commissions/history";
import { renderCommissionInvoicePdf } from "@/lib/pdf/renderCommissionInvoicePdf";

export type HistoryBatch = Pick<AvidSendEntry, "source" | "label" | "period" | "sentAt" | "sentBy" | "invoiceCount" | "propertyCount" | "total" | "partial">;

export type HistoryInvoiceRow = {
  fileName: string;
  /** Property / tenant the invoice bills. */
  label: string;
  amount: number | null;
  invoiceNumber: string | null;
};

export type BatchInvoices = {
  invoices: HistoryInvoiceRow[];
  /** "archived" = the PDFs as sent; "rebuilt" = an Allocated copy rebuilt from
   *  the GL; "none" = sent before the archive existed. */
  kind: "archived" | "rebuilt" | "none";
};

export const SOURCE_LABEL: Record<AvidSource, string> = {
  allocated: "Allocated Expenses",
  "credit-card": "Credit Card",
  payroll: "Payroll",
  commissions: "Commissions",
};

const SOURCES = new Set<string>(Object.keys(SOURCE_LABEL));
export const isSource = (s: string): s is AvidSource => SOURCES.has(s);

/** A commission send's period ("Q326") → the history's quarter key ("Q3 26"). */
export function commissionQuarterKey(period: string): string | null {
  const m = /^Q([1-4])(\d{2})\b/.exec(String(period).trim());
  return m ? `Q${m[1]} ${m[2]}` : null;
}

const commissionFile = (h: HistoryInvoice) => `${h.invoiceNumber}.pdf`;

export async function listInvoiceBatches(): Promise<HistoryBatch[]> {
  const sends = await listAvidSends(1000);
  return sends.map(({ source, label, period, sentAt, sentBy, invoiceCount, propertyCount, total, partial }) => ({
    source, label: SOURCE_LABEL[source] ?? label, period, sentAt, sentBy, invoiceCount, propertyCount, total, partial,
  }));
}

export async function batchInvoices(source: AvidSource, period: string): Promise<BatchInvoices> {
  if (source === "credit-card" || source === "payroll") {
    const a = await getSentInvoiceArchive(source, period);
    if (!a?.invoices.length) return { invoices: [], kind: "none" };
    return {
      kind: "archived",
      invoices: a.invoices.map((i) => ({ fileName: i.fileName, label: i.propertyLabel, amount: i.amount, invoiceNumber: i.fileName.replace(/\.pdf$/i, "") })),
    };
  }
  if (source === "allocated") {
    const a = await getInvoiceArchive(period).catch(() => null);
    if (!a?.invoices.length) return { invoices: [], kind: "none" };
    return {
      kind: a.reconstructed ? "rebuilt" : "archived",
      invoices: a.invoices.map((i) => ({ fileName: i.fileName, label: i.propertyLabel, amount: null, invoiceNumber: i.fileName.split("/").pop()!.replace(/\.pdf$/i, "") })),
    };
  }
  const q = commissionQuarterKey(period);
  const hist = q ? (await loadCommissionHistory())[q] ?? {} : {};
  const rows = Object.values(hist).sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  if (!rows.length) return { invoices: [], kind: "none" };
  return {
    kind: "archived",
    invoices: rows.map((h) => ({
      fileName: commissionFile(h),
      label: [h.entry.tenant, h.entry.building, h.entry.suite ? `Suite ${h.entry.suite}` : ""].filter(Boolean).join(" · "),
      amount: h.amount,
      invoiceNumber: h.invoiceNumber,
    })),
  };
}

/** One invoice's PDF bytes, or null. */
export async function invoicePdf(source: AvidSource, period: string, fileName: string): Promise<Uint8Array | null> {
  if (source === "credit-card" || source === "payroll") {
    const inv = (await getSentInvoiceArchive(source, period))?.invoices.find((i) => i.fileName === fileName);
    return inv ? new Uint8Array(Buffer.from(inv.pdfBase64, "base64")) : null;
  }
  if (source === "allocated") {
    const inv = (await getInvoiceArchive(period).catch(() => null))?.invoices.find((i) => i.fileName === fileName);
    return inv ? new Uint8Array(Buffer.from(inv.pdfBase64, "base64")) : null;
  }
  const q = commissionQuarterKey(period);
  const h = q ? Object.values((await loadCommissionHistory())[q] ?? {}).find((x) => commissionFile(x) === fileName) : null;
  if (!h) return null;
  return renderCommissionInvoicePdf({ entry: h.entry, amount: h.amount, invoiceNumber: h.invoiceNumber, invoiceDate: h.invoiceDate ?? undefined });
}
