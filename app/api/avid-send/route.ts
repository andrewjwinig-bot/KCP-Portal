import { NextResponse } from "next/server";
import { z } from "zod";
import { isMailConfigured } from "@/lib/mail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import { deliverInvoicesToAvid } from "@/lib/invoicing/avidDelivery";

// The review-before-send gate's release step for the Credit Card and Payroll
// invoicers. AvidXchange can't open a ZIP and takes one invoice per email, so
// each invoice PDF goes to AP (kormancommercial@avidbill.com) as its own email;
// the cc'd team (Marie/Drew/Harry) get one summary email with the xlsx
// references. Recipients are fixed server-side (the client only supplies the
// already-computed, property-level files), so this can never be an open relay.
//
// PRIVACY: payroll figures are property-level only — no employee-level detail is
// ever attached or written into the body.

export const runtime = "nodejs";

const CC_MARIE = "mjaster@kormancommercial.com";
const CC_DREW = "dwinig@kormancommercial.com";
const CC_HARRY = "hfeldman@kormancommercial.com";
const XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SOURCE_LABEL: Record<string, string> = {
  "credit-card": "Credit Card Expenses",
  payroll: "Payroll",
};
const TASK_FOR_SOURCE: Record<string, string | undefined> = {
  "credit-card": "m-alloc-cc",
  payroll: undefined,
};
// Distinct dedup namespace from the controller report.
const dedupKey = (source: string) => `${source}-avid`;

const BodySchema = z.object({
  source: z.enum(["credit-card", "payroll"]),
  period: z.string().min(1).max(60),
  label: z.string().max(120).optional(),
  byProperty: z
    .array(z.object({ code: z.string().min(1).max(20), name: z.string().max(120), amount: z.number() }))
    .max(400),
  total: z.number(),
  invoices: z
    .array(z.object({ propertyLabel: z.string().min(1).max(200), fileName: z.string().min(1).max(200), contentBase64: z.string().min(1) }))
    .max(400),
  references: z
    .array(z.object({ name: z.string().min(1).max(200), contentType: z.string().min(1).max(120), contentBase64: z.string().min(1) }))
    .max(8)
    .optional(),
  archiveZipBase64: z.string().optional(),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const label = SOURCE_LABEL[body.source];
  const sentAt = new Date().toISOString();
  const invoiceCount = body.invoices.length;

  // Mark the tracker task done for this month (CC only).
  const taskId = TASK_FOR_SOURCE[body.source];
  if (taskId) {
    const now = new Date();
    try { await markTaskComplete(now.getFullYear(), now.getMonth(), taskId, { at: now.toISOString(), source: body.source }); } catch { /* best-effort */ }
  }

  if (!isMailConfigured()) {
    return NextResponse.json({ sent: false, reason: "mail-not-configured", byProperty: body.byProperty, total: body.total, invoiceCount, sentAt });
  }
  try {
    if (!body.force && (await reportAlreadySent(dedupKey(body.source), body.period))) {
      return NextResponse.json({ sent: false, reason: "already-sent", byProperty: body.byProperty, total: body.total, invoiceCount, sentAt });
    }

    const result = await deliverInvoicesToAvid({
      source: body.source,
      label,
      period: body.period,
      invoices: body.invoices.map((inv) => ({ propertyLabel: inv.propertyLabel, fileName: inv.fileName, pdf: Buffer.from(inv.contentBase64, "base64") })),
      byProperty: body.byProperty.map((b) => ({ code: String(b.code), name: String(b.name), amount: Number(b.amount) })),
      total: body.total,
      // CC + payroll both cc the controller (to), Drew, and Harry.
      teamCc: [CC_MARIE, CC_DREW, CC_HARRY],
      references: (body.references ?? []).map((r) => ({ name: r.name, content: Buffer.from(r.contentBase64, "base64"), contentType: r.contentType || XLSX_CT })),
      archiveZip: body.archiveZipBase64 ? Buffer.from(body.archiveZipBase64, "base64") : null,
      privacyNote: body.source === "payroll",
    });

    // Only mark the period done once everything's out, so a retry after a
    // partial failure re-sends just the invoices that didn't go.
    if (result.allDelivered) await markReportSent(dedupKey(body.source), body.period, "kormancommercial@avidbill.com");
    return NextResponse.json({ sent: result.emailed, byProperty: body.byProperty, total: body.total, invoiceCount: (result.avidSent + result.alreadySent) || invoiceCount, sentAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to send to AvidXchange" }, { status: 500 });
  }
}

// GET ?source=&period= — has this run already been released to Avid?
export async function GET(req: Request) {
  const u = new URL(req.url);
  const source = u.searchParams.get("source") ?? "";
  const period = u.searchParams.get("period") ?? "";
  if (!["credit-card", "payroll"].includes(source) || !period) {
    return NextResponse.json({ sent: false });
  }
  return NextResponse.json({ sent: await reportAlreadySent(dedupKey(source), period) });
}
