import { NextResponse } from "next/server";
import JSZip from "jszip";
import { batchInvoices, invoicePdf, isSource, listInvoiceBatches } from "@/lib/invoicing/invoiceHistory";

// Invoice History (lib/invoicing/invoiceHistory.ts) — every AvidXchange batch.
//   GET                               → the batches, newest first
//   GET ?source=&period=              → that batch's invoices
//   GET ?source=&period=&file=        → one PDF (inline; &download=1 to save)
//   GET ?source=&period=&zip=1        → the batch's PDFs as a ZIP (for us — never Avid)
// Gated to the /invoices page (SENSITIVE_API_PREFIXES).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const safeName = (s: string) => s.replace(/["\r\n]/g, "").replace(/[\\/]/g, "-");

export async function GET(req: Request) {
  const u = new URL(req.url);
  const source = u.searchParams.get("source") ?? "";
  const period = (u.searchParams.get("period") ?? "").trim();
  if (!source) return NextResponse.json({ batches: await listInvoiceBatches() });
  if (!isSource(source) || !period) return NextResponse.json({ error: "Which batch?" }, { status: 400 });

  const file = u.searchParams.get("file");
  if (file) {
    const bytes = await invoicePdf(source, period, file);
    if (!bytes) return NextResponse.json({ error: "That invoice is not in the archive." }, { status: 404 });
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${u.searchParams.get("download") ? "attachment" : "inline"}; filename="${safeName(file.split("/").pop() || "invoice.pdf")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const batch = await batchInvoices(source, period);
  if (u.searchParams.get("zip")) {
    if (!batch.invoices.length) return NextResponse.json({ error: "No archived invoices for this batch." }, { status: 404 });
    const zip = new JSZip();
    for (const inv of batch.invoices) {
      const bytes = await invoicePdf(source, period, inv.fileName);
      if (bytes) zip.file(safeName(inv.fileName.split("/").pop() || inv.fileName), bytes);
    }
    const buf = await zip.generateAsync({ type: "uint8array" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName(`${source} ${period}`)} invoices.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return NextResponse.json(batch);
}
