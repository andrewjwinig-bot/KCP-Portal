// THE INQUIRY FORM ON EVERY SPACE PAGE (owner, 11/2026, #8: "a request form
// on every listing … auto-reply … the autoreply can be in the formatting weve
// built for emails"). A prospect asks about one space; the space's leasing
// contact (Nancy for office, Harry for retail — the listing's own, read on the
// SERVER, never the form's) is emailed in the website-submission look, the
// prospect gets an auto-reply in the portal's email look with the space's facts,
// its page and its flyer, and the inquiry is kept as a LEAD (`website-leads`)
// with where it came from, so we can see which spaces and channels produce
// them. Pure: checking the form and composing the three; the route sends.

import { portalEmail, type PortalRow } from "@/lib/email/portalEmail";
import { signatureHtml } from "@/lib/emailSignature";
import { sizeText, type SpaceListing } from "./spaces";

export type SpaceInquiryValue = {
  slug: string; name: string; company: string; email: string; phone: string;
  /** When they need it — free text ("Spring 2027", "ASAP"). */
  timing: string; message: string;
  /** How they found us: the page they came from, any utm_source. */
  source: string; referrer: string;
};

export type SpaceInquiryCheck = { ok: true; spam: boolean; value: SpaceInquiryValue } | { ok: false; error: string };

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function checkSpaceInquiry(body: Record<string, unknown>): SpaceInquiryCheck {
  const value: SpaceInquiryValue = {
    slug: clean(body.slug, 200),
    name: clean(body.name, 200),
    company: clean(body.company, 200),
    email: clean(body.email, 200),
    phone: clean(body.phone, 60),
    timing: clean(body.timing, 120),
    message: clean(body.message, 4000),
    source: clean(body.source, 120),
    referrer: clean(body.referrer, 500),
  };
  // Honeypot: a field no person sees.
  if (clean(body.website, 200)) return { ok: true, spam: true, value };
  if (!value.slug) return { ok: false, error: "This space could not be found." };
  if (!value.name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) return { ok: false, error: "Please enter a valid email address." };
  return { ok: true, spam: false, value };
}

export type Lead = SpaceInquiryValue & {
  id: string;
  at: string;
  space: string;
  property: string;
  propertyName: string;
  category: string;
  size: string;
  /** Who it went to, and whether each email went. */
  sentTo: string | null;
  delivered: boolean;
  autoReplied: boolean;
};

/** Who answers it: the listing's own leasing contact. */
export const inquiryRecipient = (l: SpaceListing, fallback = "info@kormancommercial.com") => l.requestMoreInfoEmail || fallback;

const first = (name: string) => name.split(/\s+/)[0] || name;

/** To the leasing contact — the website-submission look, a Reply button. */
export function inquiryTeamEmail(v: SpaceInquiryValue, l: SpaceListing, pageUrl: string) {
  const subject = `Inquiry: ${l.space} at ${l.propertyName} — ${v.name}`;
  const rows: PortalRow[] = [
    { label: "Space", value: `${l.space} · ${sizeText(l)}` },
    { label: "Property", value: l.propertyName },
    ...(v.company ? [{ label: "Company", value: v.company }] : []),
    { label: "Email", value: v.email },
    ...(v.phone ? [{ label: "Phone", value: v.phone }] : []),
    ...(v.timing ? [{ label: "Needs it", value: v.timing }] : []),
    { label: "Came from", value: v.source || (v.referrer ? hostOf(v.referrer) : "Direct / not known") },
  ];
  return portalEmail({
    subject,
    eyebrow: "Space Inquiry",
    brand: "WEBSITE",
    title: v.name,
    lead: `Asked about ${l.space} at ${l.propertyName}. They were sent the flyer automatically.`,
    leadBold: `${l.space} at ${l.propertyName}`,
    rows,
    ...(v.message ? { note: { label: "Message", text: v.message } } : {}),
    link: { label: `Reply to ${first(v.name)}`, path: `mailto:${v.email}?subject=${encodeURIComponent(`Re: ${l.space} at ${l.propertyName}`)}` },
    footer: `${pageUrl.replace(/^https?:\/\//, "")} · replies go to the visitor`,
    systemFooter: false,
  });
}

/** To the prospect — the portal's email look, from the company: thanks, the
 *  space's facts, who will be in touch, the page and the flyer. */
export function inquiryAutoReply(v: SpaceInquiryValue, l: SpaceListing, pageUrl: string) {
  const who = l.contactName || "our leasing team";
  const facts: PortalRow[] = [
    { label: "Space", value: l.space },
    { label: "Property", value: `${l.propertyName}${l.city ? ` · ${l.city}` : ""}` },
    { label: "Size", value: sizeText(l) },
    ...(l.rentalRate ? [{ label: "Rental rate", value: l.rentalRate }] : []),
    ...(l.available ? [{ label: "Available", value: l.available }] : []),
    ...(l.contactName ? [{ label: "Your contact", value: l.contactName }] : []),
    ...(l.contactPhone ? [{ label: "Phone", value: l.contactPhone }] : []),
    ...(l.requestMoreInfoEmail ? [{ label: "Email", value: l.requestMoreInfoEmail }] : []),
  ];
  const mail = portalEmail({
    subject: `Thanks for your interest in ${l.space} at ${l.propertyName}`,
    eyebrow: "Your Inquiry",
    brand: "COMMERCIAL PROPERTIES",
    title: `Thanks, ${first(v.name)}`,
    lead: `We received your inquiry about ${l.space} at ${l.propertyName}. ${who} will be in touch within one business day. The space's details and leasing flyer are below.`,
    leadBold: `${l.space} at ${l.propertyName}`,
    rows: facts,
    link: { label: "View the space and download the flyer", path: `${pageUrl}?flyer=1` },
    footer: "Korman Commercial Properties · since 1919",
    systemFooter: false,
  });
  // Signed by the leasing contact, with the company signature every tenant
  // email ends in (lib/emailSignature.ts).
  const sig = signatureHtml({ name: l.contactName || "Korman Commercial Properties", phone: l.contactPhone ? `P: ${l.contactPhone}` : "" });
  const block = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 12px 28px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;"><tr><td style="padding:0 4px;">${sig}</td></tr></table></td></tr></table>`;
  const text = `${mail.text}\n\n${l.contactName || "Korman Commercial Properties"}${l.contactPhone ? `\n${l.contactPhone}` : ""}\nKorman Commercial Properties\n8 Neshaminy Interplex | Suite 400 | Trevose, PA 19053`;
  return { ...mail, text, html: mail.html.replace("</body>", `${block}</body>`) };
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** "google", "linkedin", a referrer's site, or "direct" — for the lead log. */
export function leadChannel(v: Pick<SpaceInquiryValue, "source" | "referrer">): string {
  if (v.source) return v.source.toLowerCase();
  if (!v.referrer) return "direct";
  const h = hostOf(v.referrer);
  if (/google\./.test(h)) return "google";
  if (/bing\.|duckduckgo|yahoo\./.test(h)) return "search";
  if (/loopnet|costar|crexi/.test(h)) return h.split(".").slice(-2, -1)[0];
  if (/kormancommercial\.com$|theofficeworks|shoppingcenter|brookwood|parkwood|graysferry/.test(h)) return "our website";
  return h;
}
