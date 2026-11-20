import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { SITE_PROPERTIES } from "@/lib/site/content";
import { liveSiteListings } from "@/lib/site/liveListings";
import { canonicalUrl } from "@/lib/site/seo";
import { sizeText, spacePath, spaceSlug, withPropertyInfo } from "@/lib/site/spaces";
import { checkSpaceInquiry, inquiryAutoReply, inquiryRecipient, inquiryTeamEmail, leadChannel, type Lead } from "@/lib/site/spaceInquiry";
import { saveLead } from "@/lib/site/leadStore";

// Public endpoint behind the inquiry form on every space page
// (/site/space/<slug>; lib/site/spaceInquiry.ts). Honeypot + per-IP rate limit
// like the other website forms. The space is looked up on the SERVER from the
// live listings, so who is emailed is the listing's own leasing contact and a
// leased space answers "no longer available". The contact gets the inquiry
// (Reply-To the visitor), the visitor the auto-reply, and the lead is kept. A
// failed send to the contact is reported, never a false "sent"; a failed
// auto-reply is not the visitor's problem and is only recorded.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`space-inquiry:${ip}`, RATE_LIMIT_PER_HOUR))
    return NextResponse.json({ success: false, message: "Too many requests from this address. Please call us instead." }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 }); }
  const check = checkSpaceInquiry(body);
  if (check.ok === false) return NextResponse.json({ success: false, message: check.error }, { status: 400 });
  if (check.spam) return NextResponse.json({ success: true });
  const v = check.value;

  const listing = withPropertyInfo(await liveSiteListings(), SITE_PROPERTIES).find((l) => spaceSlug(l) === v.slug);
  if (!listing) return NextResponse.json({ success: false, message: "This space is no longer available. Please see our other available space." }, { status: 404 });
  const pageUrl = canonicalUrl(spacePath(listing));
  const to = inquiryRecipient(listing);
  const fallback = `Your inquiry could not be sent. Please ${listing.contactPhone ? `call ${listing.contactPhone} or ` : ""}email ${to}.`;

  let delivered = false;
  let autoReplied = false;
  if (isMailConfigured()) {
    const team = inquiryTeamEmail(v, listing, pageUrl);
    delivered = await sendMail({ to, subject: team.subject, textBody: team.text, htmlBody: team.html, headers: [{ Name: "Reply-To", Value: v.email }] });
    if (delivered) {
      const reply = inquiryAutoReply(v, listing, pageUrl);
      autoReplied = await sendMail({
        to: v.email, subject: reply.subject, textBody: reply.text, htmlBody: reply.html,
        headers: [{ Name: "Reply-To", Value: to }],
      }).catch(() => false);
    }
  }

  const lead: Lead = {
    ...v,
    id: `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    source: leadChannel(v),
    space: listing.space,
    property: listing.property,
    propertyName: listing.propertyName,
    category: listing.category,
    size: sizeText(listing),
    sentTo: to,
    delivered,
    autoReplied,
  };
  await saveLead(lead).catch((e) => console.warn(`[space-inquiry] lead not saved: ${e}`));

  if (!delivered) {
    console.warn(`[space-inquiry] mail not delivered (configured=${isMailConfigured()}) for ${v.slug}`);
    return NextResponse.json({ success: false, message: fallback }, { status: 502 });
  }
  return NextResponse.json({ success: true, autoReplied });
}
