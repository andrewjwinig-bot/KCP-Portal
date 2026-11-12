// The portal's own emails to the team — a bank transfer logged, a payroll run
// processed, a charge to post — in the PORTAL'S look, not the tenant emails'
// (owner, 11/2026: "cleaner and bolder … this wouldnt be in the interplex
// styling but in the portal styling"). The design system in email form:
// navy #0B4A7D as the only accent, ink #101828 / secondary #475467, 1px
// #E4E7EC card, hairline rows, the headline figure big and bold, status in
// words, a navy button to the page that has it.
//
// Tables and inline styles only, so Outlook draws it as designed. Pure: each
// route builds its content; this lays it out, with a plain-text twin.

import { portalOrigin } from "@/lib/linkOrigin";

const FONT = "'Hanken Grotesk',-apple-system,'Segoe UI',Arial,Helvetica,sans-serif";
const MONO = "'IBM Plex Mono',Consolas,Menlo,monospace";
const NAVY = "#0B4A7D", INK = "#101828", MUTED = "#475467", FAINT = "#667085", BORDER = "#E4E7EC", HAIR = "#EAECF0", CANVAS = "#F4F6F9";
const TONE = { good: "#067647", bad: "#B42318", warn: "#B54708" } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PortalRow = {
  label: string;
  value: string;
  /** Account numbers, unit refs, invoice numbers: navy mono. */
  code?: boolean;
  /** Say status in words, coloured: done / wrong / needs attention. */
  tone?: keyof typeof TONE;
};

export type PortalEmail = {
  subject: string;
  /** What it is, small caps above the title ("Bank Transfer"). */
  eyebrow: string;
  title: string;
  /** The one figure the email is about, big ("$5,000.00"), with its label. */
  figure?: { value: string; label?: string };
  /** One line under the title. */
  lead?: string;
  rows: PortalRow[];
  /** A free-text note someone typed ("Details"). */
  note?: { label: string; text: string };
  /** A small table (invoices, lines) under the rows. */
  table?: { columns: string[]; rows: string[][]; total?: string[]; align?: ("left" | "right")[] };
  /** The page that has it, path within the portal ("/bank-transfers"). */
  link?: { label: string; path: string };
  /** Who did it, for the footer ("Logged by Drew"). */
  footer?: string;
  /** Beside KORMAN in the masthead: "PORTAL" for the team, "COMMERCIAL
   *  PROPERTIES" for a report that goes to ownership. */
  brand?: string;
  /** "Sent by the KCP Portal" in the footer (default on; off to ownership). */
  systemFooter?: boolean;
};

export function portalEmail(e: PortalEmail): { subject: string; html: string; text: string } {
  const url = e.link ? `${portalOrigin()}${e.link.path}` : "";
  const rows = e.rows.filter((r) => r.value !== "");
  const footerLine = [e.footer, e.systemFooter === false ? "" : "Sent by the KCP Portal"].filter(Boolean).join(" \u00b7 ");
  const valueStyle = (r: PortalRow) =>
    r.code ? `font-family:${MONO};font-size:14px;color:${NAVY};`
      : `font-family:${FONT};font-size:15px;font-weight:600;color:${r.tone ? TONE[r.tone] : INK};`;
  const align = (i: number) => e.table?.align?.[i] ?? (i === 0 ? "left" : "right");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(e.subject)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};border-collapse:collapse;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;border-collapse:separate;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
<tr><td style="padding:22px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td style="font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:2px;color:${NAVY};">KORMAN <span style="font-weight:500;letter-spacing:1px;color:${FAINT};">&nbsp;|&nbsp; ${esc(e.brand ?? "PORTAL")}</span></td>
<td align="right" style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${FAINT};">${esc(e.eyebrow)}</td>
</tr></table></td></tr>
<tr><td style="padding:22px 32px 0;">
<div style="font-family:${FONT};font-size:24px;font-weight:800;line-height:1.2;color:${INK};">${esc(e.title)}</div>
${e.lead ? `<div style="font-family:${FONT};font-size:15px;line-height:1.5;color:${MUTED};margin-top:6px;">${esc(e.lead)}</div>` : ""}
</td></tr>
${e.figure ? `<tr><td style="padding:18px 32px 0;">
<div style="font-family:${FONT};font-size:40px;font-weight:800;line-height:1;color:${NAVY};letter-spacing:-0.5px;">${esc(e.figure.value)}</div>
${e.figure.label ? `<div style="font-family:${FONT};font-size:13px;font-weight:600;color:${FAINT};margin-top:6px;">${esc(e.figure.label)}</div>` : ""}
</td></tr>` : ""}
${rows.length ? `<tr><td style="padding:20px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid ${HAIR};">
${rows.map((r) => `<tr><td width="130" style="width:130px;padding:12px 0;border-bottom:1px solid ${HAIR};font-family:${FONT};font-size:14px;color:${FAINT};vertical-align:top;">${esc(r.label)}</td><td style="padding:12px 0;border-bottom:1px solid ${HAIR};${valueStyle(r)}">${esc(r.value)}</td></tr>`).join("")}
</table></td></tr>` : ""}
${e.table ? `<tr><td style="padding:20px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>${e.table.columns.map((c, i) => `<td align="${align(i)}" style="padding:0 0 8px;border-bottom:1px solid ${BORDER};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${FAINT};">${esc(c)}</td>`).join("")}</tr>
${e.table.rows.map((row) => `<tr>${row.map((v, i) => `<td align="${align(i)}" style="padding:10px 0;border-bottom:1px solid ${HAIR};font-family:${FONT};font-size:14px;color:${INK};">${esc(v)}</td>`).join("")}</tr>`).join("")}
${e.table.total ? `<tr>${e.table.total.map((v, i) => `<td align="${align(i)}" style="padding:10px 0;border-top:2px solid ${INK};font-family:${FONT};font-size:14px;font-weight:800;color:${INK};">${esc(v)}</td>`).join("")}</tr>` : ""}
</table></td></tr>` : ""}
${e.note ? `<tr><td style="padding:20px 32px 0;">
<div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${FAINT};">${esc(e.note.label)}</div>
<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};margin-top:6px;">${esc(e.note.text).replace(/\r?\n/g, "<br>")}</div>
</td></tr>` : ""}
${url ? `<tr><td style="padding:24px 32px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td height="42" bgcolor="${NAVY}" align="center" valign="middle" style="height:42px;background:${NAVY};border-radius:8px;padding:0 20px;mso-line-height-rule:exactly;line-height:42px;">
<a href="${esc(url)}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:${FONT};font-size:14px;font-weight:700;line-height:42px;display:block;"><font color="#ffffff">${esc(e.link!.label)}</font></a>
</td></tr></table></td></tr>` : ""}
<tr><td style="padding:24px 32px 22px;">
<div style="border-top:1px solid ${HAIR};padding-top:14px;font-family:${FONT};font-size:12.5px;color:${FAINT};">${esc(footerLine)}</div>
</td></tr>
</table>
</td></tr></table></body></html>`;

  const text = [
    e.title,
    e.lead ?? "",
    e.figure ? `${e.figure.label ? `${e.figure.label}: ` : ""}${e.figure.value}` : "",
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    ...(e.table ? ["", e.table.columns.join(" | "), ...e.table.rows.map((r) => r.join(" | ")), ...(e.table.total ? [e.table.total.join(" | ")] : [])] : []),
    ...(e.note ? ["", `${e.note.label}:`, e.note.text] : []),
    ...(url ? ["", `${e.link!.label}: ${url}`] : []),
    "",
    footerLine,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();

  return { subject: e.subject, html, text };
}

/** "DREW" → "Drew" for a footer. */
export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
