import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { z } from "zod";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";
import { renderInvoicePdf } from "../../../lib/pdf/renderInvoicePdf";
import { payrollInvoiceNumber } from "../../../lib/payroll/invoiceNumber";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { buildPayrollExportXlsx, buildPayrollGLXlsx } from "../../../lib/payroll/export";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const BodySchema = z.object({
  payroll: z.any(),
  invoices: z.array(z.any()).optional(),
  employees: z.array(z.any()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const allocationPath = path.join(process.cwd(), "data", "allocation.xlsx");
    const allocBuf = await readFile(allocationPath);
    const allocation = parseAllocationWorkbook(allocBuf);

    const invoices = body.invoices?.length ? body.invoices : buildInvoices(body.payroll, allocation as any);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();
    archive.pipe(stream);

    for (const inv of invoices) {
      const pdfBytes = await renderInvoicePdf({
        invoice: inv,
        payroll: body.payroll,
        invoiceNumber: inv.invoiceNumber || payrollInvoiceNumber(inv, body.payroll?.payDate),
      });

      const safeName = (inv.propertyLabel || inv.propertyKey || "invoice").replace(/[^a-z0-9\-_. ]/gi, "_");
      archive.append(Buffer.from(pdfBytes), { name: `${safeName}.pdf` });
    }

    // ── Payroll Summary + GL Journal Entry ──
    const payDate: string = body.payroll?.payDate ?? "";
    const datePrefix = formatPayDateForFilename(payDate);

    const summaryBlob = buildPayrollExportXlsx({ payDate, invoices });
    const summaryBuf = Buffer.from(await summaryBlob.arrayBuffer());
    archive.append(summaryBuf, { name: `${datePrefix} payroll-summary.xlsx` });

    const glBlob = buildPayrollGLXlsx({ payDate, invoices });
    const glBuf = Buffer.from(await glBlob.arrayBuffer());
    archive.append(glBuf, { name: `${datePrefix} GL Journal Entry.xlsx` });

    await archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zipBuf = Buffer.concat(chunks);

    return new NextResponse(zipBuf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=payroll-invoices.zip",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to generate PDFs" }, { status: 400 });
  }
}

/** Format payDate (e.g. "01/15/2026") to "01-15-26" for safe filenames */
function formatPayDateForFilename(payDate: string): string {
  if (!payDate) return "Payroll";
  const mdy = payDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${m.padStart(2, "0")}-${d.padStart(2, "0")}-${y.slice(2)}`;
  }
  const dt = new Date(payDate);
  if (!isNaN(dt.getTime())) {
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const yy = String(dt.getFullYear()).slice(2);
    return `${mm}-${dd}-${yy}`;
  }
  return payDate.replace(/[/\\?%*:|"<>]/g, "-");
}
