// The Allocated Expenses REGISTER to AP (owner, 11/2026: Tanya "doesnt get a
// total report for the 2000 allocations like she does for payroll and credit
// card expenses to match every invoice in avid to the report").
//
// Sent once per send, after every invoice has reached AvidXchange: one row per
// invoice — invoice # (the AE / TU number printed on it), property, amount — and
// the total, in the email and as an Excel register with a live total. That is
// the list she ticks off against AvidXchange's inbox.

import "server-only";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { newWorkbook, titleBlock, headerBand, totalEmphasis, liveSum, FMT, FONT_NAME, PRINT_TALL } from "@/lib/excel/theme";

export const AP_REGISTER_TO = process.env.ALLOCATED_REGISTER_TO || "trovkin@kormancommercial.com"; // Tanya
const FROM = "dwinig@kormancommercial.com"; // verified sender
const DEDUP = "allocated-register";

export type RegisterRow = { invoiceNumber: string; code: string; name: string; amount: number };

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = (n: number) => money(n).slice(1);

/** The email (pure — exported for the preview / test). */
export function registerEmail(o: { periodLabel: string; rows: RegisterRow[]; by?: string | null }) {
  const total = o.rows.reduce((t, r) => t + r.amount, 0);
  const n = o.rows.length;
  return portalEmail({
    subject: `Allocated Expenses register: ${o.periodLabel} · ${n} invoice${n === 1 ? "" : "s"} · ${money(total)}`,
    eyebrow: "Allocated Expenses",
    title: `${o.periodLabel} sent to AvidXchange`,
    lead: `${n} invoice${n === 1 ? "" : "s"}, each sent as its own email to AvidXchange. Match each one below.`,
    figure: { value: money(total), label: "Total billed" },
    rows: [],
    table: {
      columns: ["Invoice #", "Property", "Amount"],
      rows: o.rows.map((r) => [r.invoiceNumber, `${r.code} ${r.name}`, plain(r.amount)]),
      total: ["Total", `${n} invoices`, plain(total)],
      align: ["left", "left", "right"],
    },
    footer: [o.by ? `Released by ${o.by}` : "", "Register attached as Excel"].filter(Boolean).join(" · "),
  });
}

async function registerXlsx(periodLabel: string, rows: RegisterRow[]): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Register", { pageSetup: PRINT_TALL });
  ws.columns = [{ width: 18 }, { width: 10 }, { width: 38 }, { width: 16 }];
  let r = titleBlock(ws, { entity: "LIK Management", document: "Allocated Expenses — AvidXchange Register", asOf: periodLabel, width: 4 });
  headerBand(ws, r, ["Invoice #", "Property", "Name", "Amount"]);
  const first = r + 1;
  for (const row of rows) {
    r++;
    ws.getCell(r, 1).value = row.invoiceNumber;
    ws.getCell(r, 2).value = row.code;
    ws.getCell(r, 3).value = row.name;
    const c = ws.getCell(r, 4);
    c.value = row.amount; c.numFmt = FMT.moneyCents;
    for (let k = 1; k <= 4; k++) ws.getCell(r, k).font = { name: FONT_NAME, size: 10 };
  }
  const last = r;
  r++;
  ws.getCell(r, 1).value = "Total";
  ws.getCell(r, 3).value = `${rows.length} invoices`;
  const tot = ws.getCell(r, 4);
  const total = rows.reduce((t, x) => t + x.amount, 0);
  tot.value = rows.length ? liveSum(`D${first}:D${last}`, total, rows.map((x) => x.amount)) : 0;
  tot.numFmt = FMT.moneyCents;
  for (let k = 1; k <= 4; k++) totalEmphasis(ws.getCell(r, k), { grand: true });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Send the register for a send, once. Never throws — the send has already
 *  happened; a failed register is logged and retried on the next run. */
export async function sendAllocatedRegister(o: { period: string; periodLabel: string; rows: RegisterRow[]; by?: string | null }): Promise<boolean> {
  try {
    if (!o.rows.length || !isMailConfigured()) return false;
    if (await reportAlreadySent(DEDUP, o.period)) return true;
    const mail = registerEmail(o);
    const xlsx = await registerXlsx(o.periodLabel, o.rows);
    const ok = await sendMail({
      to: AP_REGISTER_TO, from: FROM, subject: mail.subject, textBody: mail.text, htmlBody: mail.html, noLinkTracking: true,
      attachments: [{ name: `${o.periodLabel} - Allocated Expenses Register.xlsx`, content: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    });
    if (ok) await markReportSent(DEDUP, o.period, AP_REGISTER_TO);
    return ok;
  } catch (e: any) {
    console.warn(`[allocated] register for ${o.period} not sent:`, e?.message ?? e);
    return false;
  }
}
