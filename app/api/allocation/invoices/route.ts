import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getInvoiceArchive } from "@/lib/allocated-invoicer/invoiceArchive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?period=&file= — one archived invoice PDF (inline, to view; add
// &download=1 to save), or with no `file` the whole month as a ZIP. These are
// the PDFs exactly as they went to AvidXchange (`invoiceArchive.ts`).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const period = u.searchParams.get("period") ?? "";
  const file = u.searchParams.get("file");
  const a = period ? await getInvoiceArchive(period) : null;
  if (!a) return NextResponse.json({ error: "No archived invoices for that period." }, { status: 404 });
  const safe = (s: string) => s.replace(/[^\w .()&-]+/g, "_");
  if (file) {
    const inv = a.invoices.find((i) => i.fileName === file);
    if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    const name = safe(inv.fileName.split("/").pop() || "invoice.pdf");
    return new NextResponse(Buffer.from(inv.pdfBase64, "base64"), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${u.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"` },
    });
  }
  const zip = new JSZip();
  for (const i of a.invoices) zip.file(i.fileName, Buffer.from(i.pdfBase64, "base64"));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(buf, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${safe(period)} - Allocated Invoices.zip"` },
  });
}
