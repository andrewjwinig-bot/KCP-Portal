// The invoice PDFs exactly as they went to AvidXchange, kept per period.
//
// A sent month cannot be re-generated faithfully: sending FINALIZES its
// carryover, so recomputing from the GL afterwards gives different invoices
// (the held balances it consumed are gone). So the PDFs are saved at the
// moment they are delivered and the invoicer's Monthly History reads them back
// — view one, or download the month as a ZIP. Months sent before this existed
// have no archive; the page says so.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "alloc-invoice-archive";
const idFor = (period: string) => period.replace(/[^0-9A-Za-z_-]+/g, "-");

export type ArchivedInvoice = { fileName: string; propertyLabel: string; pdfBase64: string };
export type InvoiceArchive = { period: string; sentAt: string; sentBy?: string | null; invoices: ArchivedInvoice[] };

export async function saveInvoiceArchive(a: InvoiceArchive): Promise<void> {
  await storeJSON(PREFIX, idFor(a.period), a);
}

export async function getInvoiceArchive(period: string): Promise<InvoiceArchive | null> {
  return ((await getJSON(PREFIX, idFor(period))) as InvoiceArchive | null) ?? null;
}
