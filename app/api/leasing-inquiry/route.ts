import { NextRequest, NextResponse } from "next/server";
import { sendMail, isMailConfigured, NEW_REQUEST_NOTIFY } from "@/lib/mail";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { centerBySlug } from "@/lib/centers/registry";

// Public leasing-inquiry endpoint for the shopping-center marketing pages.
// Same honeypot + rate-limit + middleware-exemption pattern as
// /api/reservations/submit. Emails the inquiry to the center's leasing
// contact; no PII is persisted server-side.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`leasing:${ip}`, RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json(
      { error: "Too many inquiries from this address. Try again later." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot — silently accept-and-ignore bots.
  if (clean(body.website, 200) !== "") {
    return NextResponse.json({ ok: true });
  }

  const slug = clean(body.slug, 80);
  const name = clean(body.name, 200);
  const company = clean(body.company, 200);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 60);
  const space = clean(body.space, 120);
  const message = clean(body.message, 4000);

  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "Please describe your space needs." }, { status: 400 });

  const center = centerBySlug(slug);
  const centerName = center?.name ?? "Shopping center";
  const to = center?.contact.email || "hfeldman@kormancommercial.com";

  const subjectSuite = space && !/^which space/i.test(space) ? ` — ${space}` : "";
  const subject = `Leasing inquiry: ${centerName}${subjectSuite}`;
  const textBody = [
    `New leasing inquiry for ${centerName}${center ? ` (${center.addressLine})` : ""}.`,
    "",
    `Name:     ${name}`,
    `Company:  ${company || "—"}`,
    `Email:    ${email}`,
    `Phone:    ${phone || "—"}`,
    `Space:    ${space || "—"}`,
    "",
    "Message:",
    message,
    "",
    "— Sent from the property website leasing form.",
  ].join("\n");

  let delivered = false;
  if (isMailConfigured()) {
    delivered = await sendMail({
      to,
      cc: NEW_REQUEST_NOTIFY,
      subject,
      textBody,
      headers: [{ Name: "Reply-To", Value: email }],
    });
  }

  // The submission is accepted regardless of mail delivery so the visitor
  // always gets the confirmation; delivery status is returned for observability.
  if (!delivered) {
    console.warn(`[leasing-inquiry] mail not delivered (configured=${isMailConfigured()}) for ${centerName} from ${email}`);
  }
  return NextResponse.json({ ok: true, delivered });
}
