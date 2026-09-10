import { NextResponse } from "next/server";
import { z } from "zod";
import { renderInvoicePdf } from "../../../lib/pdf/renderInvoicePdf";
import { payrollInvoiceNumber } from "../../../lib/payroll/invoiceNumber";

export const runtime = "nodejs";

const BodySchema = z.object({
  invoice: z.any(),
  payroll: z.any(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const pdfBytes = await renderInvoicePdf({
      invoice: body.invoice,
      payroll: body.payroll,
      invoiceNumber: body.invoice?.invoiceNumber || payrollInvoiceNumber(body.invoice, body.payroll?.payDate),
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
