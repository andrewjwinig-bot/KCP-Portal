// The invoice PDFs exactly as they went to AvidXchange, kept per (source,
// period) — for the Credit Card and Payroll invoicers (owner: "on credit cards
// i see the charges history but i need to see the actual invoices history as
// well"). Written by /api/avid-send once a batch is delivered; read by Expense
// History. Like the Allocated archive (`invoiceArchive.ts`), a sent month cannot
// be regenerated faithfully afterwards — the held carryover it billed is gone
// and the receipts merged into each PDF are not kept anywhere else — so the
// PDFs are saved at the moment they are sent. A resend replaces the record.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "sent-invoice-archive";
const idFor = (source: string, period: string) => `${source}-${period}`.replace(/[^0-9A-Za-z_-]+/g, "-");

export type SentInvoice = {
  fileName: string;
  propertyLabel: string;
  /** The property code the invoice bills (null for a reimbursement invoice). */
  code: string | null;
  /** The invoice's billed amount, where the send carried it. */
  amount: number | null;
  pdfBase64: string;
};
export type SentInvoiceArchive = {
  source: string;
  period: string;
  sentAt: string;
  sentBy: string | null;
  invoices: SentInvoice[];
};

export async function saveSentInvoiceArchive(a: SentInvoiceArchive): Promise<void> {
  await storeJSON(PREFIX, idFor(a.source, a.period), a);
}

export async function getSentInvoiceArchive(source: string, period: string): Promise<SentInvoiceArchive | null> {
  return ((await getJSON(PREFIX, idFor(source, period)).catch(() => null)) as SentInvoiceArchive | null) ?? null;
}

/** "4500 — Grays Ferry" gives "4500"; a reimbursement / payee label gives null. */
export function codeOfLabel(label: string, codes: string[]): string | null {
  const head = String(label).split(/\s+[—-]\s+/)[0].trim();
  return codes.includes(head) ? head : null;
}
