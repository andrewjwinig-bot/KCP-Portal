// The INVOICE REGISTER to AP — one format for every flow that bills the
// properties through AvidXchange: Allocated Expenses, Credit Card and Payroll
// (owner, 11/2026: Tanya needs "a total report … to match every invoice in avid
// to the report", and the CC and payroll ones "should match the same
// formatting").
//
// Sent once per send, after every invoice has reached AvidXchange: one row per
// invoice — the invoice # printed on it (AE / TU, CC, PR), the property, the
// amount — and the total, in the email and as an Excel register with a live
// total. That is the list she ticks off against AvidXchange's inbox.

import "server-only";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { jsPDF } from "jspdf";
import { useHanken } from "@/lib/pdf/fonts/hankenGrotesk";
import { newWorkbook, titleBlock, headerBand, totalEmphasis, liveSum, FMT, FONT_NAME, PRINT_TALL } from "@/lib/excel/theme";

export const AP_REGISTER_TO = process.env.AP_REGISTER_TO || process.env.ALLOCATED_REGISTER_TO || "trovkin@kormancommercial.com"; // Tanya
const FROM = "dwinig@kormancommercial.com"; // verified sender

/** Which flow, and how it is named. The dedup key is per flow + period. */
export type RegisterFlow = { source: "allocated" | "credit-card" | "payroll"; label: string };

export type RegisterRow = { invoiceNumber: string; code: string; name: string; amount: number };
/** A property held under the $100 floor this time — no invoice in Avid for it
 *  (or, `partial`, only part of its charges held). It bills with a later batch. */
export type HeldRow = { code: string; name: string; amount: number; partial?: boolean };

const heldLine = (h: HeldRow) => `${`${h.code} ${h.name}`.trim()} · ${money(h.amount)}${h.partial ? " (part held — the rest is invoiced above)" : ""}`;
const HELD_LABEL = "Held under $100 — no invoice this time";
const HELD_NOTE = "These carry forward and bill with a later batch, so you won't find them in AvidXchange yet.";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = (n: number) => money(n).slice(1);

/** The email (pure — exported for the preview / test). */
export function registerEmail(o: { label?: string; periodLabel: string; rows: RegisterRow[]; held?: HeldRow[]; by?: string | null }) {
  const held = (o.held ?? []).filter((h) => h.amount > 0);
  const label = o.label ?? "Allocated Expenses";
  const total = o.rows.reduce((t, r) => t + r.amount, 0);
  const n = o.rows.length;
  return portalEmail({
    subject: `${label} register: ${o.periodLabel} · ${n} invoice${n === 1 ? "" : "s"} · ${money(total)}`,
    eyebrow: "AvidXchange register",
    title: label,
    lead: `${o.periodLabel} · ${n} invoice${n === 1 ? "" : "s"}, each sent as its own email to AvidXchange. Match each one below.`,
    figure: { value: money(total), label: "Total billed" },
    rows: [],
    table: {
      columns: ["Invoice #", "Property", "Amount"],
      rows: o.rows.map((r) => [r.invoiceNumber, `${r.code} ${r.name}`.trim(), plain(r.amount)]),
      total: ["Total", `${n} invoices`, plain(total)],
      align: ["left", "left", "right"],
    },
    ...(held.length ? { note: { label: HELD_LABEL, text: [...held.map(heldLine), "", HELD_NOTE].join("\n") } } : {}),
    footer: [o.by ? `Released by ${o.by}` : "", "PDF to print and tick off, and Excel, attached"].filter(Boolean).join(" · "),
  });
}

async function registerXlsx(label: string, periodLabel: string, rows: RegisterRow[], held: HeldRow[] = []): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Register", { pageSetup: PRINT_TALL });
  ws.columns = [{ width: 18 }, { width: 10 }, { width: 38 }, { width: 16 }];
  let r = titleBlock(ws, { entity: "LIK Management", document: `${label} — AvidXchange Register`, asOf: periodLabel, width: 4 });
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
  if (held.length) {
    r += 2;
    ws.getCell(r, 1).value = HELD_LABEL;
    ws.getCell(r, 1).font = { name: FONT_NAME, size: 11, bold: true };
    for (const h of held) {
      r++;
      ws.getCell(r, 2).value = h.code;
      ws.getCell(r, 3).value = h.name + (h.partial ? " (part held)" : "");
      const c = ws.getCell(r, 4);
      c.value = h.amount; c.numFmt = FMT.moneyCents;
      for (let k = 1; k <= 4; k++) ws.getCell(r, k).font = { name: FONT_NAME, size: 10, italic: true };
    }
    r++;
    ws.getCell(r, 1).value = HELD_NOTE;
    ws.getCell(r, 1).font = { name: FONT_NAME, size: 9, italic: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The same register as a printable PDF — a tick box per invoice, so it
 *  can be checked off on paper against Avid. */
export function registerPdf(label: string, periodLabel: string, rows: RegisterRow[], by?: string | null, held: HeldRow[] = []): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  useHanken(doc);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), m = 48;
  const NAVY = [11, 74, 125] as const, INK = [16, 24, 40] as const, MUTED = [102, 112, 133] as const, HAIR = [228, 231, 236] as const, AMBER = [181, 71, 8] as const;
  const col = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const total = rows.reduce((t, r) => t + r.amount, 0);
  const xBox = m, xInv = m + 26, xProp = m + 140, xAmt = W - m;
  const rowH = 22;

  const header = (first: boolean) => {
    let y = m + 6;
    doc.setFont("Hanken", "bold"); doc.setFontSize(10); col(NAVY);
    doc.text("KORMAN", m, y);
    doc.setFont("Hanken", "normal"); col(MUTED);
    doc.text(first ? "|  AVIDXCHANGE REGISTER" : `|  ${label.toUpperCase()} · AVIDXCHANGE REGISTER`, m + 52, y);
    y += first ? 40 : 30;
    if (first) {
      doc.setFont("HankenXB", "normal"); doc.setFontSize(30); col(NAVY);
      doc.text(label, m, y);
      y += 24;
      doc.setFont("Hanken", "bold"); doc.setFontSize(15); col(INK);
      doc.text(`${periodLabel} sent to AvidXchange`, m, y);
      y += 20;
      doc.setFont("Hanken", "normal"); doc.setFontSize(11); col(MUTED);
      doc.text(`${rows.length} invoice${rows.length === 1 ? "" : "s"} · total ${money(total)}${by ? ` · released by ${by}` : ""}`, m, y);
      y += 28;
    }
    doc.setFont("Hanken", "bold"); doc.setFontSize(8.5); col(MUTED);
    doc.text("INVOICE #", xInv, y);
    doc.text("PROPERTY", xProp, y);
    doc.text("AMOUNT", xAmt, y, { align: "right" });
    y += 8;
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(1); doc.line(m, y, W - m, y);
    return y;
  };

  let y = header(true);
  doc.setFontSize(10.5);
  for (const r of rows) {
    if (y + rowH > H - m - 40) { doc.addPage(); y = header(false); }
    const mid = y + rowH / 2 + 4;
    doc.setDrawColor(150, 158, 170); doc.setLineWidth(0.8); doc.rect(xBox, mid - 9, 11, 11);
    doc.setFont("Hanken", "bold"); col(INK); doc.text(r.invoiceNumber, xInv, mid);
    doc.setFont("Hanken", "normal");
    const prop = doc.splitTextToSize(`${r.code} ${r.name}`.trim(), xAmt - 80 - xProp)[0] as string;
    doc.text(prop, xProp, mid);
    doc.text(plain(r.amount), xAmt, mid, { align: "right" });
    y += rowH;
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(0.6); doc.line(m, y, W - m, y);
  }
  doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(1.5); doc.line(m, y + 1, W - m, y + 1);
  y += 20;
  doc.setFont("Hanken", "bold"); doc.setFontSize(11); col(INK);
  doc.text("Total", xInv, y);
  doc.text(`${rows.length} invoices`, xProp, y);
  doc.text(money(total), xAmt, y, { align: "right" });
  if (held.length) {
    y += 40;
    if (y + 40 + held.length * 18 > H - m - 40) { doc.addPage(); y = m + 30; }
    doc.setFont("Hanken", "bold"); doc.setFontSize(12); col(AMBER);
    doc.text(HELD_LABEL, m, y);
    y += 16;
    doc.setFont("Hanken", "normal"); doc.setFontSize(10); col(MUTED);
    doc.text(HELD_NOTE, m, y);
    y += 8;
    doc.setFontSize(10.5);
    for (const h of held) {
      if (y + 18 > H - m - 40) { doc.addPage(); y = m + 30; }
      y += 18;
      col(INK);
      const prop = doc.splitTextToSize(`${`${h.code} ${h.name}`.trim()}${h.partial ? " (part held)" : ""}`, xAmt - 80 - xInv)[0] as string;
      doc.text(prop, xInv, y);
      doc.text(plain(h.amount), xAmt, y, { align: "right" });
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("Hanken", "normal"); doc.setFontSize(8.5); col(MUTED);
    doc.text(`${label} · ${periodLabel} · Sent by the KCP Portal`, m, H - 30);
    if (pages > 1) doc.text(`Page ${i} of ${pages}`, W - m, H - 30, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}

/** Send the register for a send, once. Never throws — the send has already
 *  happened; a failed register is logged and retried on the next run. */
export async function sendApRegister(o: RegisterFlow & { period: string; periodLabel: string; rows: RegisterRow[]; held?: HeldRow[]; by?: string | null }): Promise<boolean> {
  const dedup = `${o.source}-register`;
  try {
    if (!o.rows.length || !isMailConfigured()) return false;
    if (await reportAlreadySent(dedup, o.period)) return true;
    const mail = registerEmail(o);
    const held = (o.held ?? []).filter((h) => h.amount > 0);
    const xlsx = await registerXlsx(o.label, o.periodLabel, o.rows, held);
    const pdf = registerPdf(o.label, o.periodLabel, o.rows, o.by, held);
    const ok = await sendMail({
      to: AP_REGISTER_TO, from: FROM, subject: mail.subject, textBody: mail.text, htmlBody: mail.html, noLinkTracking: true,
      attachments: [
        { name: `${o.periodLabel} - ${o.label} Register.pdf`, content: pdf, contentType: "application/pdf" },
        { name: `${o.periodLabel} - ${o.label} Register.xlsx`, content: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    });
    if (ok) await markReportSent(dedup, o.period, AP_REGISTER_TO);
    return ok;
  } catch (e: any) {
    console.warn(`[${o.source}] register for ${o.period} not sent:`, e?.message ?? e);
    return false;
  }
}

/** "2026-10" → "October 2026"; anything else as given. */
export function monthLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
