import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { z } from "zod";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";
import { renderInvoicePdf } from "../../../lib/pdf/renderInvoicePdf";
import { payrollInvoiceNumber } from "../../../lib/payroll/invoiceNumber";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { buildPayrollExportXlsx, buildPayrollGLXlsx } from "../../../lib/payroll/export";
import { storeJSON, listJSON } from "@/lib/storage";
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

    const summaryBlob = await buildPayrollExportXlsx({ payDate, invoices });
    const summaryBuf = Buffer.from(await summaryBlob.arrayBuffer());
    archive.append(summaryBuf, { name: `${datePrefix} payroll-summary.xlsx` });

    const glBlob = buildPayrollGLXlsx({ payDate, invoices });
    const glBuf = Buffer.from(await glBlob.arrayBuffer());
    archive.append(glBuf, { name: `${datePrefix} GL Journal Entry.xlsx` });

    // No email to Marie here (owner, 11/2026: "why does she get two emails for
    // payroll"). Processing only builds the batch; the AvidXchange send
    // (`/api/payroll/avid-send`) emails her the team summary with these same
    // two files — the allocation by property and the GL import — as Credit
    // Card and Allocated Expenses do. The by-employee allocation never goes.

    // Processing the invoices is the save — record the period so the dashboard
    // reflects the latest run without anyone clicking "Save". Best-effort.
    if (payDate && invoices.length) {
      try { await recordProcessedPeriod(payDate, body.payroll, invoices, body.employees ?? []); }
      catch { /* never let the save block the download */ }
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

/** Auto-save the processed payroll as a period (the same shape the manual
 *  "Save" button writes), so processing the invoices IS the save — the user no
 *  longer has to click Save and the dashboard shows the latest run. Deduped by
 *  pay date (re-processing the same payroll updates that period, not a dupe). */
async function recordProcessedPeriod(
  payDate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payroll: any, invoices: any[], employees: any[],
): Promise<void> {
  const name = payDate || new Date().toLocaleDateString();
  // Drop per-invoice drilldown to keep the stored payload small (matches Save).
  const invoicesSlim = (invoices ?? []).map(({ drilldown: _d, ...rest }) => rest);
  const all = (await listJSON("periods")) as Array<{ id: string; name?: string; payDate?: string }>;
  const existing = all.find((p) => p?.payDate === payDate || p?.name === name);
  const id = existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await storeJSON("periods", id, {
    id, name, payDate: payDate || null, savedAt: new Date().toISOString(),
    payroll, invoices: invoicesSlim, employees: employees ?? [],
  });
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
