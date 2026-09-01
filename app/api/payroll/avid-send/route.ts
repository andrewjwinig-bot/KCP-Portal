import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { z } from "zod";
import { buildInvoices } from "../../../../lib/invoicing/buildInvoices";
import { renderInvoicePdf } from "../../../../lib/pdf/renderInvoicePdf";
import { payrollInvoiceNumber } from "../../../../lib/payroll/invoiceNumber";
import { parseAllocationWorkbook } from "../../../../lib/allocation/parseAllocationWorkbook";
import { buildPayrollExportXlsx, buildPayrollGLXlsx } from "../../../../lib/payroll/export";
import { isMailConfigured } from "@/lib/mail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { deliverInvoicesToAvid } from "@/lib/invoicing/avidDelivery";
import { readFile } from "fs/promises";
import path from "path";

// The review-before-send gate's release step for payroll: the reviewer has
// okayed the run on-screen, so the PROPERTY-LEVEL invoices go to AP (Avid) for
// processing, cc the controller (Marie), Drew, and Harry.
//
// PRIVACY: every attachment and the email body is property/account-level only —
// the per-property invoice PDFs (GL-account subtotals, no names), the property
// allocation summary, and the GL Journal Entry. The confidential by-employee
// allocation is NEVER built into this batch, so nothing can be tied back to an
// individual.

const AVID_TO = "kormancommercial@avidbill.com";
const CC_DREW = "dwinig@kormancommercial.com";
const CC_HARRY = "hfeldman@kormancommercial.com";
const XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Distinct dedup namespace (shared with /api/avid-send's payroll key).
const DEDUP = "payroll-avid";

export const runtime = "nodejs";

const BodySchema = z.object({
  payroll: z.any(),
  invoices: z.array(z.any()).optional(),
  employees: z.array(z.any()).optional(),
  force: z.boolean().optional(),
});

function fnamePrefix(payDate: string): string {
  const mdy = payDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) { const [, m, d, y] = mdy; return `${m.padStart(2, "0")}-${d.padStart(2, "0")}-${y.slice(2)}`; }
  const dt = new Date(payDate);
  if (!isNaN(dt.getTime())) return `${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}-${String(dt.getFullYear()).slice(2)}`;
  return payDate ? payDate.replace(/[/\\?%*:|"<>]/g, "-") : "Payroll";
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const payDate: string = body.payroll?.payDate ?? "";
    if (!payDate) return NextResponse.json({ error: "Payroll has no pay date." }, { status: 400 });

    const allocBuf = await readFile(path.join(process.cwd(), "data", "allocation.xlsx"));
    const allocation = parseAllocationWorkbook(allocBuf);
    const invoices = body.invoices?.length ? body.invoices : buildInvoices(body.payroll, allocation as any);
    if (!invoices.length) return NextResponse.json({ error: "No payroll invoices to send." }, { status: 400 });

    // Per-building summary — property-level totals only.
    const byProperty = invoices
      .map((inv: any) => ({ code: String(inv.propertyCode || inv.propertyKey || ""), name: String(inv.propertyLabel || inv.propertyKey || ""), amount: Math.round((Number(inv.total) || 0) * 100) / 100 }))
      .filter((b: { code: string; amount: number }) => b.code && b.amount > 0)
      .sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount);
    const total = Math.round(byProperty.reduce((s: number, b: { amount: number }) => s + b.amount, 0) * 100) / 100;
    const sentAt = new Date().toISOString();
    const datePrefix = fnamePrefix(payDate);

    if (!isMailConfigured()) {
      return NextResponse.json({ sent: false, reason: "mail-not-configured", byProperty, total, invoiceCount: invoices.length, sentAt });
    }
    if (!body.force && (await reportAlreadySent(DEDUP, payDate))) {
      return NextResponse.json({ sent: false, reason: "already-sent", byProperty, total, invoiceCount: invoices.length, sentAt });
    }

    // Property-level invoice PDFs — one per property (each becomes its own email
    // to Avid) plus a zip archive for the team's records only.
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();
    archive.pipe(stream);
    const invoicePdfs: { propertyLabel: string; fileName: string; pdf: Buffer }[] = [];
    for (const inv of invoices) {
      const pdfBytes = await renderInvoicePdf({
        invoice: inv, payroll: body.payroll,
        invoiceNumber: inv.invoiceNumber || payrollInvoiceNumber(inv, payDate),
      });
      const pdf = Buffer.from(pdfBytes);
      const safeName = (inv.propertyLabel || inv.propertyKey || "invoice").replace(/[^a-z0-9\-_. ]/gi, "_");
      archive.append(pdf, { name: `${safeName}.pdf` });
      const label = [inv.propertyCode || inv.propertyKey, inv.propertyLabel || inv.propertyKey].filter(Boolean).join(" — ");
      invoicePdfs.push({ propertyLabel: label || "Payroll", fileName: `${datePrefix} ${safeName}.pdf`, pdf });
    }
    await archive.finalize();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zipBuf = Buffer.concat(chunks);

    // Property allocation summary + GL Journal Entry (both property-level) — team
    // references only.
    const summaryBuf = Buffer.from(await buildPayrollExportXlsx({ payDate, invoices }).arrayBuffer());
    const glBuf = Buffer.from(await buildPayrollGLXlsx({ payDate, invoices }).arrayBuffer());

    const result = await deliverInvoicesToAvid({
      source: "payroll",
      label: "Payroll",
      period: payDate,
      invoices: invoicePdfs,
      byProperty,
      total,
      teamCc: [CC_DREW, CC_HARRY],
      references: [
        { name: `${datePrefix} Payroll Property Allocation.xlsx`, content: summaryBuf, contentType: XLSX_CT },
        { name: `${datePrefix} GL Journal Entry.xlsx`, content: glBuf, contentType: XLSX_CT },
      ],
      archiveZip: zipBuf,
      privacyNote: true,
    });
    // Only mark done once all invoices + summary went out (retry-safe).
    if (result.allDelivered) await markReportSent(DEDUP, payDate, AVID_TO);

    return NextResponse.json({ sent: result.emailed, byProperty, total, invoiceCount: (result.avidSent + result.alreadySent) || invoices.length, sentAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to send payroll to AvidXchange" }, { status: 400 });
  }
}
