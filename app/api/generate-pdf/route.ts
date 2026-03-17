import { NextResponse } from "next/server";
import { z } from "zod";
import { renderInvoicePdf } from "../../../lib/pdf/renderInvoicePdf";

export const runtime = "nodejs";

const BodySchema = z.object({
  invoice: z.any(),
  payroll: z.any(),
});

function makeInvoiceNumber() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const pdfBytes = await renderInvoicePdf({
      invoice: body.invoice,
      payroll: body.payroll,
      invoiceNumber: makeInvoiceNumber(),
    });
    const safeName = (body.invoice?.propertyLabel || body.invoice?.propertyKey || "invoice").replace(/[^a-z0-9\-_. ]/gi, "_");
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to generate PDF" }, { status: 400 });
  }
}
