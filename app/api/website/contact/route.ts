import { NextRequest, NextResponse } from "next/server";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkContact, contactEmailText, contactRecipients } from "@/lib/site/contact";

// Public endpoint behind the company website's Contact page (/site/contact).
// Replaces the vendor's web3forms + hCaptcha: honeypot + per-IP rate limit,
// the same guards as /api/leasing-inquiry. Exempt from site auth in
// middleware.ts (api/website/). Emails SITE_CONTACT_TO (default info@) with
// the visitor as Reply-To; nothing is stored.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`site-contact:${ip}`, RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json(
      { success: false, message: "Too many messages from this address. Please try again later." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }

  const check = checkContact(body);
  if (check.ok === false) return NextResponse.json({ success: false, message: check.error }, { status: 400 });
  if (check.spam) return NextResponse.json({ success: true, message: "Message sent successfully" });

  const { value } = check;
  let delivered = false;
  if (isMailConfigured()) {
    delivered = await sendMail({
      to: contactRecipients().join(", "),
      subject: `Website message from ${value.name}`,
      textBody: contactEmailText(value),
      headers: [{ Name: "Reply-To", Value: value.email }],
    });
  }
  if (!delivered) {
    console.warn(`[website-contact] mail not delivered (configured=${isMailConfigured()}) from ${value.email}`);
    return NextResponse.json(
      { success: false, message: "Your message could not be sent. Please email info@kormancommercial.com or call 215.244.5100." },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true, message: "Message sent successfully" });
}
