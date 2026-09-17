// Client-side helpers for the AvidBill commission-invoice PDFs.
// Used by both /commissions (office, Nancy) and /commissions/retail
// (retail, Harry) so the file-naming + browser-download flow stays
// consistent across both pages.

import JSZip from "jszip";
import { renderCommissionInvoicePdf, invoiceNumberFor } from "@/lib/pdf/renderCommissionInvoicePdf";
import type { CommissionEntry } from "@/lib/commissions";

function invoiceFileName(entry: CommissionEntry): string {
  const safe = (s: string) => (s ?? "").toString().replace(/[^a-z0-9\-_. ]/gi, "_").trim();
  const parts = [
    safe(entry.building) || "—",
    safe(entry.suite) || "—",
    safe(entry.tenant) || "—",
  ];
  return `Invoice - ${parts.join(" - ")}.pdf`;
}

/** Generate a single commission invoice PDF and trigger a download. */
export async function downloadCommissionInvoice(entry: CommissionEntry, amount: number): Promise<void> {
  const bytes = await renderCommissionInvoicePdf({
    entry,
    amount,
    invoiceNumber: invoiceNumberFor(entry.id),
  });
  triggerDownload(toBlob(bytes, "application/pdf"), invoiceFileName(entry));
}

/** Bundle one PDF per commission into a zip and trigger a download.
 *  Returns false when there are no entries (caller can surface a
 *  message). */
export async function downloadCommissionInvoicesZip(
  quarterLabel: string,
  rows: { entry: CommissionEntry; amount: number }[],
): Promise<boolean> {
  if (rows.length === 0) return false;
  const zip = new JSZip();
  // Build all PDFs in parallel — pdf-lib is CPU-bound but small.
  await Promise.all(rows.map(async ({ entry, amount }) => {
    const bytes = await renderCommissionInvoicePdf({
      entry,
      amount,
      invoiceNumber: invoiceNumberFor(entry.id),
    });
    zip.file(invoiceFileName(entry), bytes);
  }));
  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `Commission Invoices - ${quarterLabel}.zip`);
  return true;
}

function toBlob(bytes: Uint8Array, contentType: string): Blob {
  // Wrap the Uint8Array in a fresh ArrayBuffer to satisfy lib.dom's
  // BlobPart typing (pdf-lib hands back a Uint8Array that's
  // technically an ArrayBufferView).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: contentType });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
