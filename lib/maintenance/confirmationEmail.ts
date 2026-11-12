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
  const details: [string, string][] = [
    ["Property", a.propertyName],
    ["Suite", a.tenantSuite],
    ["Submitted", when],
    ["Reference", a.requestId],
  ].filter(([, v]) => v) as [string, string][];

  const cap = (t: string, color = "#6c7890") =>
    `<div style="font-family:${HEAD};font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${color};">${esc(t)}</div>`;
  const logo = ip
    ? `<img src="${IMG}/logo-interplex.png" width="250" height="69" alt="The Neshaminy Interplex Business Center" style="display:block;width:250px;height:69px;border:0;">`
    : `<img src="${IMG}/korman-signature.png" width="260" height="32" alt="Korman Commercial Properties" style="display:block;width:260px;height:32px;border:0;">`;
  const band = ["#18468b", "#838906", "#b9be4a", "#0e2c5a"].map((c) => `<td width="150" height="6" style="width:150px;height:6px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join("");
  const step = (n: string, h: string, p: string) => `
<tr><td style="padding:14px 0;border-top:1px solid #dde3ec;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background:#f1f3d6;border:1px solid #b9be4a;font-family:${HEAD};font-size:13px;font-weight:bold;color:#18468b;">${n}</td></tr></table></td>
<td valign="top" style="padding-left:6px;"><div style="font-family:${HEAD};font-size:16px;font-weight:bold;color:#0e2c5a;line-height:1.25;">${h}</div>
<div style="font-family:${BODY};font-size:13px;color:#43506a;line-height:1.5;margin-top:3px;">${p}</div></td>
</tr></table></td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;border-collapse:collapse;background:#ffffff;">
<tr><td style="padding:24px 36px 22px;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td valign="middle">${logo}</td>
<td valign="middle" align="right" style="font-family:${HEAD};font-size:10px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:#6c7890;line-height:1.7;">Service Request<br><span style="color:#838906;">Received</span></td>
</tr></table></td></tr>
<tr><td style="background:#0a1f40;padding:32px 36px 28px;">
${cap("Service Request", "#b9be4a")}
<div style="font-family:${HEAD};font-size:40px;line-height:1.02;color:#ffffff;margin-top:12px;">${esc(hello)}<br><b style="color:#b9be4a;">We&rsquo;ve got it.</b></div>
<div style="font-family:${BODY};font-size:14px;line-height:1.5;color:#c9d4e6;margin-top:16px;">Your request is in and <b style="color:#ffffff;">the service team has been notified</b>. Someone will follow up with you shortly.</div>
</td></tr>
<tr><td style="padding:0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;"><tr>${band}</tr></table></td></tr>

<tr><td style="padding:26px 36px 0;">
${cap("Your request")}
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;margin-top:8px;">
${details.map(([k, v]) => `<tr><td width="120" style="width:120px;padding:10px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};font-size:13px;color:#6c7890;">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #eaecf0;font-family:${BODY};font-size:14px;color:#13213a;${k === "Reference" ? "font-family:Consolas,Menlo,monospace;font-size:13px;color:#43506a;" : "font-weight:bold;"}">${esc(v)}</td></tr>`).join("")}
</table></td></tr>

<tr><td style="padding:18px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td width="6" style="width:6px;background:#838906;font-size:0;line-height:0;">&nbsp;</td>
<td style="background:#f1f3d6;padding:18px 22px;">
${cap("What you told us", "#6d7205")}
<div style="font-family:${BODY};font-size:14px;color:#13213a;line-height:1.55;margin-top:8px;">${esc(a.description).replace(/\r?\n/g, "<br>")}</div>
</td></tr></table></td></tr>

<tr><td style="padding:26px 36px 0;">
${cap("What happens next")}
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;margin-top:8px;">
${step("01", "We review your request", "The service team looks it over and assigns the right person to it.")}
${step("02", "We follow up with you", "We&rsquo;ll reach out if we need access to your suite or more detail, and let you know when it&rsquo;s taken care of.")}
${step("03", "Something else come up?", "Submit a separate request for each issue, so nothing gets missed.")}
</table></td></tr>

<tr><td style="padding:10px 36px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td height="41" bgcolor="#18468b" align="center" valign="middle" style="height:41px;background:#18468b;padding:0 20px;mso-line-height-rule:exactly;line-height:41px;">
<a href="${SUBMIT_URL}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:${BODY};font-size:14px;font-weight:bold;line-height:41px;display:block;"><font color="#ffffff">Submit another request &rarr;</font></a>
</td></tr></table></td></tr>

<tr><td style="padding:26px 36px 0;">
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td style="background:#18468b;padding:20px 24px;">
<div style="font-family:${HEAD};font-size:22px;font-weight:bold;color:#ffffff;line-height:1.15;">An emergency? Call, don&rsquo;t wait.</div>
<div style="font-family:${BODY};font-size:13.5px;color:#dbe3f0;line-height:1.5;margin-top:8px;">For an active leak, a fire or a security issue, call our office at <b style="color:#ffffff;">${OFFICE_PHONE}</b>. If anyone is in danger, call 911 first.</div>
</td></tr></table></td></tr>

<tr><td style="padding:28px 0 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;background:#0a1f40;"><tr>
<td valign="middle" style="padding:22px 0 22px 36px;"><img src="${IMG}/korman-white.png" width="180" height="26" alt="Korman Commercial Properties" style="display:block;width:180px;height:26px;border:0;">
<div style="font-family:${HEAD};font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#aebbd3;margin-top:9px;">Property Management</div></td>
<td valign="middle" align="right" style="padding:22px 36px 22px 0;font-family:${BODY};font-size:11.5px;color:#c9d4e6;line-height:1.55;">Questions or requests?<br><a href="${SUBMIT_URL}" target="_blank" style="color:#b9be4a;text-decoration:none;font-family:${HEAD};font-weight:bold;font-size:14px;">kormancommercial.com/site/maintenance</a></td>
</tr></table></td></tr>
</table></body></html>`;

  const text = [
    a.firstName ? `Hi ${a.firstName},` : "Hi,",
    "",
    "Thanks for submitting a service request. It's in, and the service team has been notified. Someone will follow up with you shortly.",
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    "What you told us:",
    a.description,
    "",
    "What happens next: the service team reviews your request and assigns the right person; we'll reach out if we need access or more detail, and let you know when it's taken care of. Something else come up? Submit a separate request for each issue:",
    SUBMIT_URL,
    "",
    `An emergency? For an active leak, a fire or a security issue, call our office at ${OFFICE_PHONE}. If anyone is in danger, call 911 first.`,
    "",
    "Korman Commercial Properties · Property Management",
  ].join("\n");

  return { subject, html, text };
}
