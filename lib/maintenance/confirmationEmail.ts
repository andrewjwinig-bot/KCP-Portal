// The emails a tenant gets about a service request (owner, 11/2026: "redo
// this automated email in the same style … professional", then "simpler and
// more condensed"), in the look of the Interplex tenant emails: the property's
// logo (the Interplex's for its buildings, Korman's elsewhere), a navy band
// with the headline, the details as a clean table, what they asked for, and
// the navy footer.
//
//   confirmationEmail — on submit (with the emergency block)
//   statusEmail       — when staff move it to In Progress (with the emergency
//                       block) or Complete
//
// Live HTML, not an image, since every field is the tenant's own. Tables and
// inline styles only, so Outlook draws it as designed. Pure: the routes send
// it; the test renders it. Replies to service@ are not stored, so nothing here
// asks the tenant to reply.

import { INTERPLEX_BUILDINGS } from "@/lib/interplex/spaces";

export const SUBMIT_URL = "https://kormancommercial.com/site/maintenance";
const IMG = "https://kormancommercial.com/site/email";
/** The company line, as the email signature carries it. */
export const OFFICE_PHONE = "215.638.1050";

const INTERPLEX = new Set([...Object.values(INTERPLEX_BUILDINGS), "4900"]);
export const isInterplex = (code: string | null | undefined) => INTERPLEX.has(String(code ?? "").trim().toUpperCase());

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const HEAD = "Jost,'Century Gothic',Futura,Arial,Helvetica,sans-serif";
const BODY = "Arial,Helvetica,sans-serif";

/** "Wednesday, November 11 at 7:34 PM", Eastern. */
export function submittedLabel(d: Date): string {
  const day = d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

const placeOf = (propertyName: string, suite: string) =>
  [propertyName, suite ? `Suite ${suite}` : ""].filter(Boolean).join(" · ");

export type Shell = {
  propertyCode: string | null;
  subject: string;
  eyebrow: string;
  /** "Thanks, Drew." + the olive half "We've got it." */
  hello: string;
  accent: string;
  sub: string;
  details: [string, string][];
  boxLabel: string;
  boxText: string;
  emergency: boolean;
  /** A message a person wrote (staff to a tenant), shown under the band as
   *  plain paragraphs, with the sender's name under it. */
  letter?: { body: string; signedBy: string };
  /** One call to action under the details. */
  button?: { label: string; url: string };
  /** A short muted line under the button (a privacy note, an office line). */
  footNote?: string;
  /** One code to read off — a PIN — set large in its own box. */
  code?: { label: string; value: string };
  /** Never the Interplex logo (an investor email). */
  kormanLogo?: boolean;
};

export function shell(s: Shell): string {
  const cap = (t: string, color = "#6c7890") =>
    `<div style="font-family:${HEAD};font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${color};">${esc(t)}</div>`;
  const logo = !s.kormanLogo && isInterplex(s.propertyCode)
    ? `<img src="${IMG}/logo-interplex.png" width="200" height="55" alt="The Neshaminy Interplex Business Center" style="display:block;width:200px;height:55px;border:0;">`
    : `<img src="${IMG}/korman-signature.png" width="230" height="28" alt="Korman Commercial Properties" style="display:block;width:230px;height:28px;border:0;">`;
  const band = ["#18468b", "#838906", "#b9be4a", "#0e2c5a"].map((c) => `<td width="150" height="5" style="width:150px;height:5px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join("");
  const details = s.details.filter(([, v]) => v);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;border-collapse:collapse;background:#ffffff;">
<tr><td style="padding:20px 36px 18px;">${logo}</td></tr>
<tr><td style="background:#0a1f40;padding:${s.letter ? "18px 36px" : "24px 36px 22px"};">
${cap(s.eyebrow, "#b9be4a")}
${s.hello ? `<div style="font-family:${HEAD};font-size:30px;font-weight:bold;line-height:1.1;color:#ffffff;margin-top:10px;">${esc(s.hello)} <span style="color:#b9be4a;">${esc(s.accent)}</span></div>` : ""}
${s.sub ? `<div style="font-family:${BODY};font-size:14px;line-height:1.5;color:#c9d4e6;margin-top:10px;">${esc(s.sub)}</div>` : ""}
</td></tr>
<tr><td style="padding:0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;"><tr>${band}</tr></table></td></tr>

${s.letter ? `
<tr><td style="padding:24px 36px 4px;font-family:${BODY};font-size:14.5px;line-height:1.6;color:#13213a;">
${esc(s.letter.body).split(/\r?\n\s*\r?\n/).map((p) => `<p style="margin:0 0 14px;">${p.replace(/\r?\n/g, "<br>")}</p>`).join("")}
<p style="margin:4px 0 0;font-weight:bold;color:#0e2c5a;">${esc(s.letter.signedBy)}</p>
<p style="margin:0;font-size:12.5px;color:#6c7890;">Korman Commercial Properties</p>
</td></tr>` : ""}
${details.length ? `<tr><td style="padding:20px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;">
${details.map(([k, v]) => `<tr><td width="100" style="width:100px;padding:8px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};font-size:13px;color:#6c7890;">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};${k === "Reference" ? "font-family:Consolas,Menlo,monospace;font-size:12px;color:#6c7890;" : "font-size:14px;font-weight:bold;color:#13213a;"}">${esc(v)}</td></tr>`).join("")}
</table></td></tr>` : ""}
${s.boxText ? `
<tr><td style="padding:16px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td width="5" style="width:5px;background:#838906;font-size:0;line-height:0;">&nbsp;</td>
<td style="background:#f1f3d6;padding:14px 18px;">
${cap(s.boxLabel, "#6d7205")}
<div style="font-family:${BODY};font-size:14px;color:#13213a;line-height:1.5;margin-top:6px;">${esc(s.boxText).replace(/\r?\n/g, "<br>")}</div>
</td></tr></table></td></tr>` : ""}
${s.code ? `
<tr><td style="padding:18px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td align="center" style="background:#f1f3d6;border:1px solid #b9be4a;padding:18px 22px;">
${cap(s.code.label, "#6d7205")}
<div style="font-family:Consolas,Menlo,'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:8px;color:#0e2c5a;margin-top:8px;">${esc(s.code.value)}</div>
</td></tr></table></td></tr>` : ""}
${s.button ? `
<tr><td style="padding:18px 36px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td height="40" bgcolor="#18468b" align="center" valign="middle" style="height:40px;background:#18468b;padding:0 20px;mso-line-height-rule:exactly;line-height:40px;">
<a href="${esc(s.button.url)}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:${BODY};font-size:14px;font-weight:bold;line-height:40px;display:block;"><font color="#ffffff">${esc(s.button.label)} &rarr;</font></a>
</td></tr></table></td></tr>` : ""}
${s.emergency ? `
<tr><td style="padding:18px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td style="background:#18468b;padding:18px 22px;">
<div style="font-family:${HEAD};font-size:21px;font-weight:bold;color:#ffffff;line-height:1.15;">An emergency? Call, don&rsquo;t wait.</div>
<div style="font-family:${BODY};font-size:13.5px;color:#dbe3f0;line-height:1.5;margin-top:7px;">For an active leak, a fire or a security issue, call our office at <b style="color:#ffffff;">${OFFICE_PHONE}</b>. If anyone is in danger, call 911 first.</div>
</td></tr></table></td></tr>` : ""}

${s.footNote ? `<tr><td style="padding:16px 36px 0;font-family:${BODY};font-size:12.5px;line-height:1.5;color:#6c7890;">${esc(s.footNote)}</td></tr>` : ""}
<tr><td style="padding:24px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;background:#0a1f40;"><tr>
<td valign="middle" style="padding:16px 0 16px 36px;"><img src="${IMG}/korman-white.png" width="150" height="22" alt="Korman Commercial Properties" style="display:block;width:150px;height:22px;border:0;"></td>
<td valign="middle" align="right" style="padding:16px 36px 16px 0;font-family:${HEAD};font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#aebbd3;">Property Management</td>
</tr></table></td></tr>
</table></body></html>`;
}

export function textOf(s: Shell, firstName: string): string {
  if (s.letter) {
    return [s.letter.body, "", s.letter.signedBy, "Korman Commercial Properties", "",
      ...s.details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join("\n").trim();
  }
  return [
    firstName ? `Hi ${firstName},` : "Hi,",
    "",
    s.sub,
    ...(s.button ? ["", `${s.button.label}: ${s.button.url}`] : []),
    "",
    ...s.details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    ...(s.boxText ? ["", `${s.boxLabel}:`, s.boxText] : []),
    ...(s.code ? ["", `${s.code.label}: ${s.code.value}`] : []),
    ...(s.footNote ? ["", s.footNote] : []),
    ...(s.emergency ? ["", `An emergency? For an active leak, a fire or a security issue, call our office at ${OFFICE_PHONE}. If anyone is in danger, call 911 first.`] : []),
    "",
    "Korman Commercial Properties · Property Management",
  ].join("\n");
}

// ─── On submit ───────────────────────────────────────────────────────────────

export type ConfirmationArgs = {
  firstName: string;
  propertyCode: string;
  propertyName: string;
  tenantSuite: string;
  description: string;
  requestId: string;
  submittedAt: Date;
};

export function confirmationEmail(a: ConfirmationArgs): { subject: string; html: string; text: string } {
  const s: Shell = {
    propertyCode: a.propertyCode,
    subject: `Service request received — ${a.propertyName || "Korman Commercial Properties"}`,
    eyebrow: "Service Request Received",
    hello: a.firstName ? `Thanks, ${a.firstName}.` : "Thank you.",
    accent: "We’ve got it.",
    sub: "The service team has been notified and will follow up shortly.",
    details: [["Location", placeOf(a.propertyName, a.tenantSuite)], ["Submitted", submittedLabel(a.submittedAt)], ["Reference", a.requestId]],
    boxLabel: "Your request",
    boxText: a.description,
    emergency: true,
  };
  return { subject: s.subject, html: shell(s), text: textOf(s, a.firstName) };
}

// ─── When staff move it along ────────────────────────────────────────────────

export type StatusArgs = {
  status: "In Progress" | "Complete";
  tenantName: string;
  propertyCode: string | null;
  propertyName: string;
  tenantSuite: string;
  /** The request as the queue summarizes it. */
  summary: string;
  requestId: string;
  submittedAt: Date | null;
  completedAt: Date | null;
};

export function statusEmail(a: StatusArgs): { subject: string; html: string; text: string } {
  const first = a.tenantName.trim().split(/\s+/)[0] ?? "";
  const done = a.status === "Complete";
  const where = a.propertyName || "Korman Commercial Properties";
  const s: Shell = done
    ? {
      propertyCode: a.propertyCode,
      subject: `Your service request is complete — ${where}`,
      eyebrow: "Service Request Complete",
      hello: first ? `All set, ${first}.` : "All set.",
      accent: "It’s done.",
      sub: "Your service request has been completed. If anything still isn’t right, submit a new request and we’ll take another look.",
      details: [["Location", placeOf(a.propertyName, a.tenantSuite)], ["Completed", a.completedAt ? submittedLabel(a.completedAt) : ""], ["Reference", a.requestId]],
      boxLabel: "Your request",
      boxText: a.summary,
      emergency: false,
    }
    : {
      propertyCode: a.propertyCode,
      subject: `Work has started on your service request — ${where}`,
      eyebrow: "Service Request Update",
      hello: first ? `Good news, ${first}.` : "Good news.",
      accent: "Work has started.",
      sub: "Our team is working on your request. We’ll let you know when it’s done.",
      details: [["Location", placeOf(a.propertyName, a.tenantSuite)], ["Submitted", a.submittedAt ? submittedLabel(a.submittedAt) : ""], ["Reference", a.requestId]],
      boxLabel: "Your request",
      boxText: a.summary,
      emergency: true,
    };
  return { subject: s.subject, html: shell(s), text: textOf(s, first) };
}

// ─── A message staff write to a tenant from a request ────────────────────────

/** The staff member's own words in the letter layout: logo, a slim band
 *  naming what it is about, the message, their name, then the details. */
export function staffMessageEmail(a: {
  propertyCode: string | null; subject: string; eyebrow: string; body: string; signedBy: string; details: [string, string][];
}): { html: string; text: string } {
  const s: Shell = {
    propertyCode: a.propertyCode, subject: a.subject, eyebrow: a.eyebrow, hello: "", accent: "", sub: "",
    details: a.details, boxLabel: "", boxText: "", emergency: false, letter: { body: a.body, signedBy: a.signedBy },
  };
  return { html: shell(s), text: textOf(s, "") };
}

// ─── Email sent to service@ ──────────────────────────────────────────────────

/** The auto-reply to an email sent to service@: requests come in through the
 *  form, so point them at it (a real link — the old reply linked "/submit"). */
export function inboundAutoReplyEmail(fromName: string): { html: string; text: string } {
  const first = fromName.trim().split(/\s+/)[0] ?? "";
  const s: Shell = {
    propertyCode: null, subject: "Service requests", eyebrow: "Service Requests",
    hello: first ? `Thanks, ${first}.` : "Thanks for reaching out.", accent: "Please use our request form.",
    sub: "Service requests come in through a quick form, so we get your building, suite, photos and contact details in one place and can send the right person faster.",
    details: [], boxLabel: "", boxText: "", emergency: true,
    button: { label: "Submit a service request", url: SUBMIT_URL },
  };
  return { html: shell(s), text: textOf(s, first) };
}

// ─── A tenant's private portal link ──────────────────────────────────────────

/** "Your 2025 statement is ready": the link as a button (never shown as a
 *  long URL), what's in the portal, and a word on keeping it private. */
export function portalLinkEmail(a: { propertyCode: string; propertyName: string; unitRef: string; tenantName: string; year: number; url: string }): { subject: string; html: string; text: string } {
  // One name for it throughout — "your 2025 CAM / RET statement" — said once
  // in the headline, never repeated in the details or a list (owner: "it
  // feels inconsistent").
  const s: Shell = {
    propertyCode: a.propertyCode,
    subject: `Your ${a.year} CAM / RET statement is ready — Korman Commercial Properties`,
    eyebrow: `${a.year} CAM / RET Statement`,
    hello: `Your ${a.year} statement`, accent: "is ready.",
    sub: "View it online, with the invoices behind each expense, and download a copy for your records.",
    details: [["Tenant", a.tenantName], ["Location", [a.propertyName, a.unitRef].filter(Boolean).join(" · ")]],
    boxLabel: "", boxText: "",
    emergency: false,
    button: { label: "View your statement", url: a.url },
  };
  s.footNote = `This link is private to your suite. Please don't forward it outside your company. Questions about the statement? Call our office at ${OFFICE_PHONE}.`;
  return { subject: s.subject, html: shell(s), text: textOf(s, "") };
}
