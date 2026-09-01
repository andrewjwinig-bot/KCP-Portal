import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { markTaskComplete } from "@/lib/tracker/completionStore";

// The review-before-send gate's release step for the Credit Card and Payroll
// invoicers: the reviewer (Harry/Drew) has confirmed the run on-screen, so the
// invoices go to AP (AvidXchange) for processing, cc the controller (Marie),
// Drew, and Harry for his records. Recipients are fixed server-side (the client
// only supplies the already-computed, property-level files + summary), so this
// can never be used as an open relay.
//
// PRIVACY: payroll emails carry ONLY property-level figures (the per-building
// summary + the property-level GL/summary workbooks). No employee-level payroll
// detail is ever attached or written into the body — a property total can't be
// tied back to an individual.

export const runtime = "nodejs";

const AVID_TO = "kormancommercial@avidbill.com";
const CC_MARIE = "mjaster@kormancommercial.com";
const CC_DREW = "dwinig@kormancommercial.com";
const CC_HARRY = "hfeldman@kormancommercial.com";
const REPORT_FROM = "dwinig@kormancommercial.com"; // verified Postmark sender

// Both flows cc Marie, Drew, and Harry (Harry keeps a record of when it was
// sent, with the property-level summary in the body).
const CC_LIST = [CC_MARIE, CC_DREW, CC_HARRY].join(", ");

const SOURCE_LABEL: Record<string, string> = {
  "credit-card": "Credit Card Expenses",
  payroll: "Payroll",
};
// Completing the run's monthly tracker task (payroll is pay-date driven — no
// monthly task — so it has no entry here).
const TASK_FOR_SOURCE: Record<string, string | undefined> = {
  "credit-card": "m-alloc-cc",
  payroll: undefined,
};
// Distinct dedup namespace from the controller report (source "credit-card" /
// "allocated") so an Avid send and a controller report don't cancel each other.
const dedupKey = (source: string) => `${source}-avid`;

function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BodySchema = z.object({
  source: z.enum(["credit-card", "payroll"]),
  period: z.string().min(1).max(60),
  label: z.string().max(120).optional(),
  byProperty: z
    .array(z.object({ code: z.string().min(1).max(20), name: z.string().max(120), amount: z.number() }))
    .max(200),
  total: z.number(),
  invoiceCount: z.number().int().nonnegative().optional(),
  attachments: z
    .array(z.object({ name: z.string().min(1).max(200), contentBase64: z.string().min(1), contentType: z.string().min(1).max(120) }))
    .max(8),
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

  // Mark the tracker task done for this month (CC only) — the reviewed send is
  // the completion signal.
  const taskId = TASK_FOR_SOURCE[body.source];
  if (taskId) {
    const now = new Date();
    try { await markTaskComplete(now.getFullYear(), now.getMonth(), taskId, { at: now.toISOString(), source: body.source }); } catch { /* best-effort */ }
  }

  if (!isMailConfigured()) {
    return NextResponse.json({ sent: false, reason: "mail-not-configured", byProperty: body.byProperty, total: body.total, invoiceCount: body.invoiceCount ?? 0, sentAt });
  }

  try {
    if (!body.force && (await reportAlreadySent(dedupKey(body.source), body.period))) {
      return NextResponse.json({ sent: false, reason: "already-sent", byProperty: body.byProperty, total: body.total, invoiceCount: body.invoiceCount ?? 0, sentAt });
    }

    // Per-building summary lines + TOTAL, right-aligned dollars (mirrors the
    // allocated-expense email body).
    const bp = body.byProperty;
    const nameW = Math.max(0, ...bp.map((b) => `${b.code} — ${b.name}`.length));
    const amtW = Math.max(money(body.total).length, ...bp.map((b) => money(b.amount).length));
    const rowLine = (l: string, a: string) => `  ${l.padEnd(nameW)}   ${a.padStart(amtW)}`;
    const summaryBody = bp.length
      ? bp.map((b) => rowLine(`${b.code} — ${b.name}`, money(b.amount))).join("\n") +
        `\n  ${"TOTAL".padEnd(nameW)}   ${money(body.total).padStart(amtW)}`
      : "  (no property detail)";
    const count = body.invoiceCount ?? bp.length;
    const privacyLine = body.source === "payroll"
      ? `\nThese figures are property-level only — no employee payroll detail is included.\n`
      : "";

    const ok = await sendMail({
      to: AVID_TO,
      cc: CC_LIST,
      from: REPORT_FROM,
      subject: `${label} — ${body.period}`,
      textBody:
        `Attached are the ${body.period} ${label.toLowerCase()} invoices` +
        `${count ? ` (${count} propert${count === 1 ? "y" : "ies"})` : ""} for processing, ` +
        `reviewed and released for AvidXchange.\n\n` +
        `Allocation by building:\n${summaryBody}\n${privacyLine}\n` +
        `— KCP Portal`,
      attachments: body.attachments.map((a) => ({
        name: a.name,
        content: Buffer.from(a.contentBase64, "base64"),
        contentType: a.contentType,
      })),
    });

    if (ok) await markReportSent(dedupKey(body.source), body.period, AVID_TO);
    return NextResponse.json({ sent: ok, byProperty: body.byProperty, total: body.total, invoiceCount: count, sentAt });
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
