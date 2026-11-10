// The balance reminder — a tenant with open charges, emailed their account as
// it stands (owner, 11/2026: "see … what our last correspondence to them was
// … so we can send another email"). Pure: the page's draft and the send build
// the SAME email, and the table is generated from the stored statement — the
// figures a tenant reads are never typed.

import type { Account } from "./receiptMatch";
import { signatureHtml, signatureText, type EmailSignature } from "@/lib/emailSignature";

export type ReminderInput = {
  tenantName: string;
  propertyName: string;
  suite: string;
  acct: Account;
  /** Past due (summary.pastDueAmount) — said only when there is some. */
  pastDue: number;
  asOfISO: string | null;
  attached: boolean;
  signer: { name: string; title?: string; email: string; phone?: string };
};

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (t: string) => t.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Subject + the editable opening and closing around the generated table. */
export function reminderEmailParts(x: ReminderInput): { subject: string; opening: string; closing: string } {
  const owe = x.acct.net;
  const subject = `Account statement — ${x.propertyName}, Suite ${x.suite}: ${usd(owe)} open`;
  const opening = [
    `Hello ${x.tenantName},`,
    [
      `Our records show an open balance of ${usd(owe)} on your account for ${x.propertyName}, Suite ${x.suite}${x.asOfISO ? `, as of ${longDate(x.asOfISO)}` : ""}.`,
      x.pastDue > 0.005 ? `${usd(x.pastDue)} of it is past due.` : "",
      `The open charges${x.acct.credit > 0.005 ? " and credits" : ""} are listed below${x.attached ? ", and your statement is attached" : ""}.`,
    ].filter(Boolean).join(" "),
  ].join("\n\n");
  const closing = [
    `If you have already sent payment, thank you — please reply with the date and check number so we can match it. If you have a question about any of these charges, just reply to this email.`,
    `If you are not the person who handles payments for your company, please forward this email to the appropriate person or department.`,
    // The signature (name, office, phone, logo) is added at render.
    `Thank you,`,
  ].join("\n\n");
  return { subject, opening, closing };
}

type Row = { date: string; description: string; amount: number; credit: boolean };
function rowsOf(acct: Account): Row[] {
  return [
    ...acct.charges.map((c) => ({ date: shortDate(c.dateISO), description: c.description, amount: c.amount, credit: false })),
    ...acct.creditLines.map((c) => ({ date: shortDate(c.dateISO), description: c.description, amount: -c.amount, credit: true })),
  ];
}

export function reminderTableHtml(acct: Account, asOfISO: string | null): string {
  const NAVY = "#0b4a7d", GREEN = "#15803d", LINE = "#d9dee5", MUTED = "#6b7280";
  const th = (t: string, right = false) => `<th style="padding:8px 10px;text-align:${right ? "right" : "left"};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ffffff;background:${NAVY}">${t}</th>`;
  const body = rowsOf(acct).map((r) => `<tr><td style="padding:7px 10px;border-bottom:1px solid ${LINE};color:${MUTED};white-space:nowrap">${esc(r.date)}</td><td style="padding:7px 10px;border-bottom:1px solid ${LINE};white-space:nowrap">${esc(r.description)}</td><td style="padding:7px 10px;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;${r.credit ? `color:${GREEN}` : ""}">${r.credit ? `(${usd(r.amount)})` : usd(r.amount)}</td></tr>`).join("");
  const total = `<tr style="background:#f3f6f9"><td style="padding:8px 10px"></td><td style="padding:8px 10px;font-weight:800">Balance due</td><td style="padding:8px 10px;text-align:right;font-weight:800;white-space:nowrap">${acct.net < 0 ? `(${usd(acct.net)}) credit` : usd(acct.net)}</td></tr>`;
  return `<div style="margin:6px 0 18px">
<div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${NAVY};margin:0 0 6px">Your open charges${asOfISO ? ` as of ${shortDate(asOfISO)}` : ""}</div>
<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:auto;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;border:1px solid ${LINE}">
<thead><tr>${th("Date")}${th("Charge")}${th("Amount", true)}</tr></thead>
<tbody>${body}${total}</tbody></table>
</div>`;
}

function reminderTableText(acct: Account, asOfISO: string | null): string {
  return [
    `YOUR OPEN CHARGES${asOfISO ? ` AS OF ${shortDate(asOfISO)}` : ""}`, "",
    ...rowsOf(acct).map((r) => `  ${r.date} — ${r.description}: ${r.credit ? `(${usd(r.amount)})` : usd(r.amount)}`),
    "", `  Balance due: ${acct.net < 0 ? `(${usd(acct.net)}) credit` : usd(acct.net)}`,
  ].join("\n");
}

/** The email as it sends — Tami's text escaped around the generated table. */
export function renderReminderEmail(acct: Account, asOfISO: string | null, opening: string, closing: string, sig?: EmailSignature): { html: string; text: string } {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:700px">${paras(opening)}${reminderTableHtml(acct, asOfISO)}${paras(closing)}${sig ? signatureHtml(sig) : ""}</div>`;
  return { html, text: `${opening}\n\n${reminderTableText(acct, asOfISO)}\n\n${closing}${sig ? `\n${signatureText(sig)}` : ""}` };
}
