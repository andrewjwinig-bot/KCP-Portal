import { NextRequest, NextResponse } from "next/server";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkLeasing, leasingEmailText, leasingRecipients } from "@/lib/site/leasing";

// Public endpoint behind the Neshaminy Interplex Business Center website's
// leasing form (/site/office/neshaminy-interplex). Same guards as the tour and
// Contact forms: honeypot + per-IP rate limit, public by the middleware's
// api/website/ exemption. Emails Nancy (leasingRecipients — INTERPLEX_LEASING_TO,
// default nfox@) with the visitor as Reply-To; nothing is stored. A failed send
// is reported, never a false "sent".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;
const FALLBACK = "Your inquiry could not be sent. Please call 215.244.5175 or email nfox@kormancommercial.com.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`interplex-leasing:${ip}`, RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json({ success: false, message: "Too many requests from this address. Please call 215.244.5175." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
  const check = checkLeasing(body);
  if (check.ok === false) return NextResponse.json({ success: false, message: check.error }, { status: 400 });
  if (check.spam) return NextResponse.json({ success: true });

  const { value } = check;
  let delivered = false;
  if (isMailConfigured()) {
    delivered = await sendMail({
      to: leasingRecipients().join(", "),
      subject: `Interplex leasing inquiry — ${value.name}${value.building ? ` · ${value.building}` : ""}`,
      textBody: leasingEmailText(value),
      headers: [{ Name: "Reply-To", Value: value.email }],
    });
  }
  if (!delivered) {
    console.warn(`[interplex-leasing] mail not delivered (configured=${isMailConfigured()}) from ${value.email}`);
    return NextResponse.json({ success: false, message: FALLBACK }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
