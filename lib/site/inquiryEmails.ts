// The website's form submissions to the team — the kormancommercial.com
// Contact form, the Interplex leasing inquiry and The Office Works tour
// request (Nancy), and a shopping centre's leasing inquiry (its leasing
// contact) — in the PORTAL'S email look (`portalEmail`), with a Reply
// button to the visitor. They were plain text (owner, 11/2026: "lets see the
// website submissions to nancy next"). Pure: each route sends what this
// returns; the plain-text twin rides along.

import { portalEmail, type PortalRow } from "@/lib/email/portalEmail";
import { tourDateLabel, type TourValue } from "./tour";
import type { LeasingValue } from "./leasing";
import type { ContactInput } from "./contact";

type Mail = { subject: string; html: string; text: string };

const contactRows = (v: { email: string; phone?: string; company?: string }): PortalRow[] => [
  ...(v.company ? [{ label: "Company", value: v.company }] : []),
  { label: "Email", value: v.email },
  ...(v.phone ? [{ label: "Phone", value: v.phone }] : []),
];

const reply = (name: string, email: string, subject: string) => ({
  label: `Reply to ${name.split(/\s+/)[0] || name}`,
  path: `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject}`)}`,
});

function build(e: {
  subject: string; eyebrow: string; title: string; lead: string; leadBold?: string; rows: PortalRow[];
  note?: string; noteLabel?: string; name: string; email: string; source: string;
}): Mail {
  return portalEmail({
    subject: e.subject,
    eyebrow: e.eyebrow,
    brand: "WEBSITE",
    title: e.title,
    lead: e.lead,
    leadBold: e.leadBold,
    rows: e.rows,
    ...(e.note ? { note: { label: e.noteLabel ?? "Message", text: e.note } } : {}),
    link: reply(e.name, e.email, e.subject),
    footer: `${e.source} · replies go to the visitor`,
    systemFooter: false,
  });
}

export function contactEmail(v: Omit<ContactInput, "website">): Mail {
  return build({
    subject: `Website message from ${v.name}`,
    eyebrow: "Contact Form",
    title: v.name,
    lead: "Sent a message through the kormancommercial.com contact form.",
    leadBold: "kormancommercial.com",
    rows: contactRows(v),
    note: v.message,
    name: v.name, email: v.email,
    source: "kormancommercial.com",
  });
}

export function leasingInquiryEmail(v: LeasingValue): Mail {
  return build({
    subject: `Interplex leasing inquiry — ${v.name}${v.building ? ` · ${v.building}` : ""}`,
    eyebrow: "Leasing Inquiry",
    title: v.name,
    lead: "Asked about space at the Neshaminy Interplex Business Center.",
    leadBold: "Neshaminy Interplex Business Center",
    rows: [
      { label: "Space needed", value: v.size || "Not given" },
      { label: "Building", value: v.building || "No preference" },
      ...contactRows(v),
    ],
    note: v.notes, noteLabel: "Notes",
    name: v.name, email: v.email,
    source: "Neshaminy Interplex website",
  });
}

export function tourRequestEmail(v: TourValue): Mail {
  return build({
    subject: `Office Works tour request — ${v.name}${v.office ? ` · Office ${v.office}` : ""}`,
    eyebrow: "Tour Request",
    title: v.name,
    lead: "Asked to tour The Office Works.",
    leadBold: "The Office Works",
    rows: [
      { label: "Program", value: v.program },
      { label: "Office", value: v.office ? `Office ${v.office}` : "No preference" },
      { label: "Preferred date", value: tourDateLabel(v.date) },
      ...contactRows(v),
    ],
    name: v.name, email: v.email,
    source: "The Office Works website",
  });
}

export function centerLeasingEmail(v: {
  centerName: string; address?: string; name: string; company: string; email: string;
  phone: string; space: string; message: string;
}): Mail {
  const suite = v.space && !/^which space/i.test(v.space) ? v.space : "";
  return build({
    subject: `Leasing inquiry: ${v.centerName}${suite ? ` — ${suite}` : ""}`,
    eyebrow: "Leasing Inquiry",
    title: v.name,
    lead: `Asked about space at ${v.centerName}${v.address ? ` (${v.address})` : ""}.`,
    leadBold: v.centerName,
    rows: [{ label: "Space", value: suite || "Not given" }, ...contactRows(v)],
    note: v.message,
    name: v.name, email: v.email,
    source: `${v.centerName} website`,
  });
}
