import { NextRequest, NextResponse } from "next/server";
import { normalizeInbound, type ParsedEmail } from "@/lib/maintenance/emails";

// Inbound parsed-email webhook.
//
// The portal no longer stores inbound emails — tenants are expected to use
// /submit instead. This endpoint exists purely as a safety net: while
// tenants are still discovering the form, an inbound email to maintenance@
// triggers an auto-reply pointing them at the form. Once tenant adoption is
// confirmed, the Postmark inbound forwarder can be turned off and this
// route never fires.
//
// Auth: MAINTENANCE_INBOUND_TOKEN as ?token=… or X-Inbound-Token header.
// Outbound: POSTMARK_SERVER_TOKEN + MAINTENANCE_REPLY_FROM env vars.
// Form link: PORTAL_SUBMIT_URL (e.g. https://portal.kcp.com/submit).
//
// Middleware exempts this path from site-cookie auth.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_REPLY_PATTERNS = [
  /no-?reply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /bounce/i,
];

export async function POST(req: NextRequest) {
  const expected = process.env.MAINTENANCE_INBOUND_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "MAINTENANCE_INBOUND_TOKEN not set" },
      { status: 503 },
    );
  }
  const got =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-inbound-token") ??
    "";
  if (got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let parsed: ParsedEmail;
  try {
    parsed = normalizeInbound(payload);
  } catch {
    return NextResponse.json({ error: "Could not parse email" }, { status: 400 });
  }

  // Always 200 OK so Postmark doesn't retry — auto-reply is best-effort.
  if (shouldSkipReply(parsed)) {
    return NextResponse.json({ ok: true, skipped: "loop-protection" });
  }

  const sent = await sendAutoReply(parsed);
  return NextResponse.json({ ok: true, replied: sent });
}

function shouldSkipReply(email: ParsedEmail): boolean {
  if (!email.fromEmail) return true;
  if (NO_REPLY_PATTERNS.some((re) => re.test(email.fromEmail))) return true;
  // Avoid replying to our own auto-replies.
  if (/^(auto:|out of office:|automatic reply:)/i.test(email.subject)) return true;
  // Postmark passes the original RFC822 headers through; check for the
  // standard auto-reply marker so we don't ping-pong with vacation responders.
  const autoSubmitted = email.headers.find((h) => h.Name.toLowerCase() === "auto-submitted");
  if (autoSubmitted && autoSubmitted.Value.toLowerCase() !== "no") return true;
  return false;
}

async function sendAutoReply(email: ParsedEmail): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.MAINTENANCE_REPLY_FROM;
  const submitUrl = process.env.PORTAL_SUBMIT_URL ?? "/submit";
  if (!token || !from) return false;

  const firstName = email.fromName.split(/\s+/)[0] || "there";
  const subject = email.subject
    ? `Re: ${email.subject.replace(/^Re:\s*/i, "")}`
    : "Re: Maintenance request";

  const body = [
    `Hi ${firstName},`,
    "",
    "Thanks for contacting KCP Maintenance. We've moved to a quick web form so we can capture your building, unit, photos, and contact info in one place and get a technician dispatched faster.",
    "",
    `Please submit your request here: ${submitUrl}`,
    "",
    "If this is an after-hours emergency (active leak, fire, security), please call your property's emergency line.",
    "",
    "— KCP Maintenance",
  ].join("\n");

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: from,
        To: email.fromEmail,
        Subject: subject,
        TextBody: body,
        MessageStream: "outbound",
        Headers: [
          // Mark our own message as an auto-reply so other systems skip
          // replying back (RFC 3834).
          { Name: "Auto-Submitted", Value: "auto-replied" },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
