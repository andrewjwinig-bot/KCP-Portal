// The tenant's confirmation when they submit a service request (owner,
// 11/2026: "redo this automated email in the same style … professional"),
// in the look of the Interplex tenant emails: a white masthead with the
// property's logo (the Interplex's for its buildings, Korman's elsewhere), a
// navy band, the details as a clean table, what happens next, and the navy
// footer. Live HTML, not an image, since every field is the tenant's own.
// Tables and inline styles only, so Outlook draws it as designed.
//
// Pure: the submit route sends it; the test renders it.

import { INTERPLEX_BUILDINGS } from "@/lib/interplex/spaces";

export const SUBMIT_URL = "https://kormancommercial.com/site/maintenance";
const IMG = "https://kormancommercial.com/site/email";
/** The company line, as the email signature carries it. */
export const OFFICE_PHONE = "215.638.1050";

const INTERPLEX = new Set([...Object.values(INTERPLEX_BUILDINGS), "4900"]);
export const isInterplex = (code: string) => INTERPLEX.has(code.trim().toUpperCase());

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const HEAD = "Jost,'Century Gothic',Futura,Arial,Helvetica,sans-serif";
const BODY = "Arial,Helvetica,sans-serif";

export type ConfirmationArgs = {
  firstName: string;
  propertyCode: string;
  propertyName: string;
  tenantSuite: string;
  description: string;
  requestId: string;
  submittedAt: Date;
};

/** "Wednesday, November 11 at 7:34 PM", Eastern. */
export function submittedLabel(d: Date): string {
  const day = d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

export function confirmationEmail(a: ConfirmationArgs): { subject: string; html: string; text: string } {
  const ip = isInterplex(a.propertyCode);
  const where = a.propertyName || "Korman Commercial Properties";
  const subject = `Service request received — ${where}`;
  const hello = a.firstName ? `Thanks, ${a.firstName}.` : "Thank you.";
  const when = submittedLabel(a.submittedAt);
  const place = [a.propertyName, a.tenantSuite ? `Suite ${a.tenantSuite}` : ""].filter(Boolean).join(" · ");
  const details: [string, string][] = [
    ["Location", place],
    ["Submitted", when],
    ["Reference", a.requestId],
  ].filter(([, v]) => v) as [string, string][];

  const cap = (t: string, color = "#6c7890") =>
    `<div style="font-family:${HEAD};font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${color};">${esc(t)}</div>`;
  const logo = ip
    ? `<img src="${IMG}/logo-interplex.png" width="200" height="55" alt="The Neshaminy Interplex Business Center" style="display:block;width:200px;height:55px;border:0;">`
    : `<img src="${IMG}/korman-signature.png" width="230" height="28" alt="Korman Commercial Properties" style="display:block;width:230px;height:28px;border:0;">`;
  const band = ["#18468b", "#838906", "#b9be4a", "#0e2c5a"].map((c) => `<td width="150" height="5" style="width:150px;height:5px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;border-collapse:collapse;background:#ffffff;">
<tr><td style="padding:20px 36px 18px;">${logo}</td></tr>
<tr><td style="background:#0a1f40;padding:24px 36px 22px;">
${cap("Service Request Received", "#b9be4a")}
<div style="font-family:${HEAD};font-size:30px;font-weight:bold;line-height:1.1;color:#ffffff;margin-top:10px;">${esc(hello)} <span style="color:#b9be4a;">We&rsquo;ve got it.</span></div>
<div style="font-family:${BODY};font-size:14px;line-height:1.5;color:#c9d4e6;margin-top:10px;">The service team has been notified and will follow up shortly.</div>
</td></tr>
<tr><td style="padding:0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;"><tr>${band}</tr></table></td></tr>

<tr><td style="padding:20px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;">
${details.map(([k, v]) => `<tr><td width="100" style="width:100px;padding:8px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};font-size:13px;color:#6c7890;">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};${k === "Reference" ? "font-family:Consolas,Menlo,monospace;font-size:12px;color:#6c7890;" : "font-size:14px;font-weight:bold;color:#13213a;"}">${esc(v)}</td></tr>`).join("")}
</table></td></tr>

<tr><td style="padding:16px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td width="5" style="width:5px;background:#838906;font-size:0;line-height:0;">&nbsp;</td>
<td style="background:#f1f3d6;padding:14px 18px;">
${cap("Your request", "#6d7205")}
<div style="font-family:${BODY};font-size:14px;color:#13213a;line-height:1.5;margin-top:6px;">${esc(a.description).replace(/\r?\n/g, "<br>")}</div>
</td></tr></table></td></tr>

<tr><td style="padding:18px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td style="background:#18468b;padding:18px 22px;">
<div style="font-family:${HEAD};font-size:21px;font-weight:bold;color:#ffffff;line-height:1.15;">An emergency? Call, don&rsquo;t wait.</div>
<div style="font-family:${BODY};font-size:13.5px;color:#dbe3f0;line-height:1.5;margin-top:7px;">For an active leak, a fire or a security issue, call our office at <b style="color:#ffffff;">${OFFICE_PHONE}</b>. If anyone is in danger, call 911 first.</div>
</td></tr></table></td></tr>

<tr><td style="padding:24px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;background:#0a1f40;"><tr>
<td valign="middle" style="padding:16px 0 16px 36px;"><img src="${IMG}/korman-white.png" width="150" height="22" alt="Korman Commercial Properties" style="display:block;width:150px;height:22px;border:0;"></td>
<td valign="middle" align="right" style="padding:16px 36px 16px 0;font-family:${HEAD};font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#aebbd3;">Property Management</td>
</tr></table></td></tr>
</table></body></html>`;

  const text = [
    a.firstName ? `Hi ${a.firstName},` : "Hi,",
    "",
    "Thanks for submitting a service request. The service team has been notified and will follow up shortly.",
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    "Your request:",
    a.description,
    "",
    `An emergency? For an active leak, a fire or a security issue, call our office at ${OFFICE_PHONE}. If anyone is in danger, call 911 first.`,
    "",
    "Korman Commercial Properties · Property Management",
  ].join("\n");

  return { subject, html, text };
}
