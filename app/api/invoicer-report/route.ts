import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { markTaskComplete } from "@/lib/tracker/completionStore";

// Processing an invoicer run auto-completes its tracker task, so it drops off
// the weekly digest / dashboard once it's actually done.
const TASK_FOR_SOURCE: Record<string, string> = {
  "credit-card": "m-alloc-cc",  // "Allocate CC Charges"
  "allocated": "m-alloc-exp",   // "Allocate Expenses"
};

export const runtime = "nodejs";

// When the credit-card or allocation invoicer is processed, the GL Skyline
// import file + the summary report go to the controller — same recipient as the
// payroll allocation report. Recipients are fixed server-side (the client only
// supplies the files), so this can't be used as an open relay.
const REPORT_TO = "mjaster@kormancommercial.com";
const REPORT_CC = "dwinig@kormancommercial.com";
const REPORT_FROM = "dwinig@kormancommercial.com"; // verified Postmark sender

const SOURCE_LABEL: Record<string, string> = {
  "credit-card": "Credit Card Expenses",
  allocated: "Allocated Expenses",
};

const BodySchema = z.object({
  source: z.enum(["credit-card", "allocated"]),
  period: z.string().min(1).max(60),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        contentBase64: z.string().min(1),
        contentType: z.string().min(1).max(120),
      }),
    )
    .min(1)
    .max(6),
  /** Resend even if this period was already sent. */
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Mark the tracker task done for this month — regardless of whether the email
  // goes out — because the run itself is the completion signal.
  const taskId = TASK_FOR_SOURCE[body.source];
  if (taskId) {
    const now = new Date();
    try { await markTaskComplete(now.getFullYear(), now.getMonth(), taskId, { at: now.toISOString(), source: body.source }); } catch { /* best-effort */ }
  }

  if (!isMailConfigured()) {
    return NextResponse.json({ sent: false, reason: "mail-not-configured", taskCompleted: !!taskId });
  }

  try {
    if (!body.force && (await reportAlreadySent(body.source, body.period))) {
      return NextResponse.json({ sent: false, reason: "already-sent" });
    }

    const label = SOURCE_LABEL[body.source];
    const ok = await sendMail({
      to: REPORT_TO,
      cc: REPORT_CC,
      from: REPORT_FROM,
      subject: `${label} Processed — ${body.period}`,
      textBody:
        `Marie,\n\n` +
        `Attached are the GL Skyline import file and the summary report for the ` +
        `${body.period} ${label.toLowerCase()} invoicing run.\n\n` +
        `Sent automatically when the invoices were processed.`,
      attachments: body.attachments.map((a) => ({
        name: a.name,
        content: Buffer.from(a.contentBase64, "base64"),
        contentType: a.contentType,
      })),
    });

    if (ok) await markReportSent(body.source, body.period, REPORT_TO);
    return NextResponse.json({ sent: ok });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to send report" }, { status: 500 });
  }
}
