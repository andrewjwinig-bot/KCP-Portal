import { NextRequest, NextResponse } from "next/server";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { contactRecipients } from "@/lib/site/contact";
import { checkTour, tourEmailText } from "@/lib/site/tour";

// Public endpoint behind The Office Works website's tour form (/office-works).
// Same guards as /api/website/contact: honeypot + per-IP rate limit, public by
// the middleware's api/website/ exemption. Emails SITE_CONTACT_TO (default
// info@) with the visitor as Reply-To; nothing is stored. A failed send is
// reported, never a false "sent".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;
const FALLBACK = "Your request could not be sent. Please call 215.244.5175 or email info@kormancommercial.com.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`ow-tour:${ip}`, RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json({ success: false, message: "Too many requests from this address. Please call 215.244.5175." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
  const check = checkTour(body);
  if (check.ok === false) return NextResponse.json({ success: false, message: check.error }, { status: 400 });
  if (check.spam) return NextResponse.json({ success: true });

  const { value } = check;
  let delivered = false;
  if (isMailConfigured()) {
    delivered = await sendMail({
      to: contactRecipients().join(", "),
      subject: `Office Works tour request — ${value.name}${value.office ? ` · Office ${value.office}` : ""}`,
      textBody: tourEmailText(value),
      headers: [{ Name: "Reply-To", Value: value.email }],
    });
  }
  if (!delivered) {
    console.warn(`[office-works-tour] mail not delivered (configured=${isMailConfigured()}) from ${value.email}`);
    return NextResponse.json({ success: false, message: FALLBACK }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
