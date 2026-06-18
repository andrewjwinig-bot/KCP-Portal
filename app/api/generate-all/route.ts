import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { z } from "zod";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";
import { renderInvoicePdf } from "../../../lib/pdf/renderInvoicePdf";
import { payrollInvoiceNumber } from "../../../lib/payroll/invoiceNumber";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { buildPayrollExportXlsx, buildPayrollGLXlsx } from "../../../lib/payroll/export";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { allocReportAlreadySent, markAllocReportSent } from "@/lib/payroll/allocReportSent";
import { readFile } from "fs/promises";
import path from "path";

// When payroll is processed, the property-level allocation report goes to the
// controller. NEVER the confidential by-employee allocation.
const ALLOC_REPORT_TO = "mjaster@kormancommercial.com";
const ALLOC_REPORT_CC = "dwinig@kormancommercial.com";

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

    // Auto-email the PROPERTY allocation report (the per-property Payroll Summary
    // above — property-level totals only, no per-employee detail) plus the GL
    // Journal Entry import file (account/property-level journal lines, also no
    // per-employee detail) to the controller when payroll is processed.
    // Best-effort and once per pay date so re-downloading the batch doesn't
    // resend. The confidential by-employee allocation is never attached.
    try {
      if (payDate && invoices.length && isMailConfigured() && !(await allocReportAlreadySent(payDate))) {
        const ok = await sendMail({
          to: ALLOC_REPORT_TO,
          cc: ALLOC_REPORT_CC,
          from: ALLOC_REPORT_CC, // verified sender (also used by the commissions batch)
          subject: `Payroll Property Allocation — ${payDate}`,
          textBody:
            `Attached for the ${payDate} payroll:\n` +
            `  • Property allocation report (per-property totals only)\n` +
            `  • GL Journal Entry import file\n\n` +
            `Sent automatically when the payroll invoices were processed. Neither attachment includes any per-employee allocation detail.`,
          attachments: [
            {
              name: `${datePrefix} Payroll Property Allocation.xlsx`,
              content: summaryBuf,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
            {
              name: `${datePrefix} GL Journal Entry.xlsx`,
              content: glBuf,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        });
        if (ok) await markAllocReportSent(payDate, ALLOC_REPORT_TO);
      }
    } catch {
      // Never let the report email block invoice generation.
    }

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
