// The open-credit notice — a tenant carrying a credit, told what it is and
// asked how they want it applied (owner, 11/2026: "email tenants with open
// credits to make them aware and ask them how they want to be applied for the
// next months rent"). Pure: the Open Credits page's draft and the send build
// the SAME email, and the table comes from the stored Aging Report — the
// figures a tenant reads are never typed.

import type { AgingLine } from "./parseAgingReport";
import { daysOpen, lineLabel } from "./aging";

export type CreditNoticeInput = {
  tenantName: string;
  propertyName: string;
  suite: string;
  lines: AgingLine[];
  asOfISO: string;
  /** "December 2026" — the next rent the credit can go against. */
  nextRentMonth: string;
  signer: { name: string; title?: string; email: string; phone?: string };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (t: string) => t.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
const shortDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function creditTotals(lines: AgingLine[]) {
  const credit = r2(-lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0));
  const charges = r2(lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0));
  return { credit, charges, net: r2(charges - credit) };
}

/** The month after the as-of date, "December 2026". */
export function nextMonthLabel(asOfISO: string): string {
  const d = new Date(`${asOfISO.slice(0, 7)}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function creditNoticeParts(x: CreditNoticeInput): { subject: string; opening: string; closing: string } {
  const t = creditTotals(x.lines);
  const credits = x.lines.filter((l) => l.amount < 0);
  const subject = `Credit on your account — ${x.propertyName}, Suite ${x.suite}: ${usd(t.credit)}`;
  const what = credits.length === 1
    ? `It is from ${lineLabel(credits[0]).replace(/\s+/g, " ")}${credits[0].dateISO ? `, dated ${longDate(credits[0].dateISO)}` : ""}.`
    : `It is made up of the ${credits.length} credits listed below.`;
  const opening = [
    `Hello ${x.tenantName},`,
    [
      `Our records show a credit of ${usd(t.credit)} on your account for ${x.propertyName}, Suite ${x.suite}, as of ${longDate(x.asOfISO)}. ${what}`,
      t.charges > 0.005 ? `You also have ${usd(t.charges)} of open charges, so your net balance is ${t.net < 0 ? `a credit of ${usd(t.net)}` : usd(t.net)}.` : "",
    ].filter(Boolean).join(" "),
  ].join("\n\n");
  const closing = [
    `How would you like the credit applied? We can apply it to your ${x.nextRentMonth} rent${t.charges > 0.005 ? " or to the open charges above" : ""} — just reply to this email and let us know. If you believe the credit is not correct, please reply and we will look into it.`,
    `If you are not the person who handles payments for your company, please forward this email to the appropriate person or department.`,
    [`Thank you,`, x.signer.name, ...(x.signer.title ? [x.signer.title] : []), "Korman Commercial Properties", x.signer.email, ...(x.signer.phone ? [x.signer.phone] : [])].join("\n"),
  ].join("\n\n");
  return { subject, opening, closing };
}

/** Credits first (oldest first), then any open charges, then the net. */
function rowsOf(lines: AgingLine[]) {
  const credits = lines.filter((l) => l.amount < 0).sort((a, b) => (a.dateISO ?? "").localeCompare(b.dateISO ?? ""));
  const charges = lines.filter((l) => l.amount > 0);
  return [...credits, ...charges];
}

export function creditNoticeTableHtml(lines: AgingLine[], asOfISO: string): string {
  const NAVY = "#0b4a7d", GREEN = "#15803d", LINE = "#d9dee5", MUTED = "#6b7280";
  const t = creditTotals(lines);
  const th = (s: string, right = false) => `<th style="padding:8px 10px;text-align:${right ? "right" : "left"};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ffffff;background:${NAVY}">${s}</th>`;
  const body = rowsOf(lines).map((l) => {
    const credit = l.amount < 0;
    const days = daysOpen(l.dateISO, asOfISO);
    return `<tr><td style="padding:7px 10px;border-bottom:1px solid ${LINE};color:${MUTED};white-space:nowrap">${esc(shortDate(l.dateISO))}</td><td style="padding:7px 10px;border-bottom:1px solid ${LINE}">${esc(lineLabel(l))}${credit ? ` <span style="color:${MUTED}">· credit</span>` : ""}</td><td style="padding:7px 10px;border-bottom:1px solid ${LINE};color:${MUTED};text-align:right;white-space:nowrap">${days === null ? "—" : `${days} days`}</td><td style="padding:7px 10px;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;${credit ? `color:${GREEN}` : ""}">${credit ? `(${usd(l.amount)})` : usd(l.amount)}</td></tr>`;
  }).join("");
  const total = `<tr style="background:#f3f6f9"><td style="padding:8px 10px"></td><td style="padding:8px 10px;font-weight:800">${t.net < 0 ? "Credit balance" : "Balance due"}</td><td></td><td style="padding:8px 10px;text-align:right;font-weight:800;white-space:nowrap;${t.net < 0 ? `color:${GREEN}` : ""}">${t.net < 0 ? `(${usd(t.net)})` : usd(t.net)}</td></tr>`;
  return `<div style="margin:6px 0 18px">
<div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${NAVY};margin:0 0 6px">Your account as of ${esc(shortDate(asOfISO))}</div>
<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;border:1px solid ${LINE}">
<thead><tr>${th("Date")}${th("Item")}${th("Open", true)}${th("Amount", true)}</tr></thead>
<tbody>${body}${total}</tbody></table>
</div>`;
}

function tableText(lines: AgingLine[], asOfISO: string): string {
  const t = creditTotals(lines);
  return [
    `YOUR ACCOUNT AS OF ${shortDate(asOfISO)}`, "",
    ...rowsOf(lines).map((l) => `  ${shortDate(l.dateISO)} — ${lineLabel(l)}${l.amount < 0 ? " (credit)" : ""}: ${l.amount < 0 ? `(${usd(l.amount)})` : usd(l.amount)}`),
    "", `  ${t.net < 0 ? "Credit balance" : "Balance due"}: ${t.net < 0 ? `(${usd(t.net)})` : usd(t.net)}`,
  ].join("\n");
}

export function renderCreditNotice(lines: AgingLine[], asOfISO: string, opening: string, closing: string): { html: string; text: string } {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:700px">${paras(opening)}${creditNoticeTableHtml(lines, asOfISO)}${paras(closing)}</div>`;
  return { html, text: `${opening}\n\n${tableText(lines, asOfISO)}\n\n${closing}` };
}
