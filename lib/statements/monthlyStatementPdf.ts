// Branded monthly tenant statement, drawn onto a jsPDF page.
//
// Deliberately the same letterhead, tinted section bars, zebra rows and boxed
// balance as the CAM/RET reconciliation statement (lib/cam/retail/statementPdf)
// so a tenant gets one consistent Korman document whichever statement they open.

import { AGING_LABEL, CATEGORY_LABEL, type TenantStatement } from "./types";
import { dateLabel, periodLabel, statementCharges, summarize } from "./summary";
import type { PaymentInstructions } from "./payment";

const money = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type MonthlyStatementOpts = {
  /** "1100 — Academy Plaza". */
  propLabel: string;
  period: string;
  payment: PaymentInstructions;
  /** Bottom-left footer note. */
  footerNote?: string;
};

const PAGE_W = 612, PAGE_H = 792;
const L = 48, R = 564, W = R - L;
const NAVY: [number, number, number] = [11, 74, 125];
const TINT: [number, number, number] = [230, 238, 245];
const MUTED: [number, number, number] = [110, 110, 110];
const INK: [number, number, number] = [20, 20, 20];
const LINE: [number, number, number] = [205, 210, 216];
const GREEN: [number, number, number] = [21, 128, 61];
const AMBER: [number, number, number] = [180, 83, 9];

/** Draw one tenant's monthly statement onto the current page of a jsPDF doc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawMonthlyStatement(doc: any, st: TenantStatement, opts: MonthlyStatementOpts) {
  const s = summarize(st, opts.period);
  const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
  let y = 0;
  const at = (s2: string, x: number, o?: { align?: "right" | "center" | "left" }) => doc.text(s2, x, y, o);

  const letterhead = () => {
    fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
    ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("KORMAN", L, 46);
    stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Statement of Account", R, 38, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(periodLabel(opts.period), R, 54, { align: "right" });
  };
  const footer = () => {
    stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
    ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(opts.footerNote ?? "Questions on any charge? Contact us before the due date.", L, 766);
    doc.text(`${st.tenantName}  ·  Suite ${st.suite}  ·  ${periodLabel(opts.period)}`, R, 766, { align: "right" });
  };
  /** Start a new page when `need` points won't fit above the footer rule. */
  const room = (need: number) => {
    if (y + need <= 736) return;
    footer(); doc.addPage(); letterhead(); y = 112;
  };
  const bar = (title: string, rightHead?: [string, string]) => {
    room(40);
    fill(TINT); doc.rect(L, y - 11, W, 18, "F"); ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    at(title.toUpperCase(), L + 6);
    if (rightHead) {
      ink(MUTED); doc.setFontSize(7.5);
      at(rightHead[0].toUpperCase(), R - 172); at(rightHead[1].toUpperCase(), R - 6, { align: "right" });
    }
    y += 22; ink(INK); doc.setFontSize(10);
  };

  letterhead();

  // ── Bill-to + as-of ────────────────────────────────────────────────────────
  y = 112; ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(15); at(st.tenantName, L);
  y += 16; ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  at(`${opts.propLabel}   ·   Suite ${st.suite}   ·   ${st.unitRef}`, L);
  for (const line of st.address) { y += 13; at(line, L); }
  y += 26;

  // ── Amount due box ─────────────────────────────────────────────────────────
  const credit = s.totalDue < -0.005;
  const theme = credit ? GREEN : s.totalDue > 0.005 ? AMBER : NAVY;
  fill(credit ? [235, 247, 239] : s.totalDue > 0.005 ? [252, 245, 235] : [240, 245, 250]);
  stroke(theme); doc.setLineWidth(1.2); doc.rect(L, y, W, 56, "FD");
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(credit ? "CREDIT ON ACCOUNT" : "TOTAL AMOUNT DUE", L + 16, y + 22);
  ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(`This month ${money(s.currentCharges)}   ·   Prior balance ${money(s.priorBalance)}`, L + 16, y + 38);
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(24);
  doc.text(money(Math.abs(s.totalDue)), R - 16, y + 34, { align: "right" });
  y += 78;

  // ── Aging ──────────────────────────────────────────────────────────────────
  if (s.byAging.length > 1) {
    bar("Aging");
    doc.setFontSize(9);
    s.byAging.forEach((b, i) => {
      if (i % 2 === 1) { fill([247, 249, 251]); doc.rect(L, y - 9, W, 13, "F"); }
      doc.setFont("helvetica", "normal");
      ink(b.bucket === "current" ? MUTED : AMBER); at(AGING_LABEL[b.bucket], L + 6);
      ink(INK); at(money(b.amount), R - 6, { align: "right" });
      y += 13;
    });
    y += 12; doc.setFontSize(10);
  }

  // ── Open charges ───────────────────────────────────────────────────────────
  bar("Open Charges", ["Type", "Amount"]);
  doc.setFontSize(9);
  statementCharges(st).forEach((c, i) => {
    room(20);
    if (i % 2 === 1) { fill([247, 249, 251]); doc.rect(L, y - 9, W, 13, "F"); }
    doc.setFont("helvetica", "normal");
    ink(MUTED); at(dateLabel(c.dateISO), L + 6);
    ink(c.amount < 0 ? GREEN : INK); at(doc.splitTextToSize(c.description, 230)[0], L + 78);
    ink(MUTED); doc.setFontSize(8); at(CATEGORY_LABEL[c.category], R - 172); doc.setFontSize(9);
    ink(c.amount < 0 ? GREEN : INK); at(money(c.amount), R - 6, { align: "right" });
    y += 13;
  });
  room(24);
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(L, y - 9, R, y - 9);
  ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  at("Total Amount Due", L + 6); at(money(s.totalDue), R - 6, { align: "right" });
  y += 26;

  // ── How to pay ─────────────────────────────────────────────────────────────
  // Kept together: a remittance address split across a page break is exactly
  // the thing a tenant mis-reads, so break before the section, never inside it.
  const p = opts.payment;
  const contactLine = [p.contactName, p.contactEmail, p.contactPhone].filter(Boolean).join("  ·  ");
  const paraHeight = (lines: string[]) => (lines.length ? 19 + doc.splitTextToSize(lines.join("\n"), W - 24).length * 12 : 0);
  const payHeight = 22
    + paraHeight([`Make checks payable to ${p.payableTo} and mail to:`, ...p.remitTo])
    + paraHeight(p.achNote ? [p.achNote] : [])
    + paraHeight(contactLine ? [`Contact ${contactLine}.`] : [])
    + (p.note ? doc.splitTextToSize(p.note, W - 12).length * 12 : 0);
  room(payHeight);
  bar("How to Pay");
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  const para = (label: string, lines: string[]) => {
    if (!lines.length) return;
    room(16 + lines.length * 12);
    ink(NAVY); doc.setFont("helvetica", "bold"); at(label, L + 6); y += 13;
    ink(INK); doc.setFont("helvetica", "normal");
    for (const l of lines) { for (const w of doc.splitTextToSize(l, W - 24)) { at(w, L + 6); y += 12; } }
    y += 6;
  };
  para("By check", [`Make checks payable to ${p.payableTo} and mail to:`, ...p.remitTo]);
  if (p.achNote) para("By ACH or wire", [p.achNote]);
  if (contactLine) para("Questions", [`Contact ${contactLine}.`]);
  if (p.note) {
    room(20);
    ink(MUTED); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
    for (const w of doc.splitTextToSize(p.note, W - 12)) { at(w, L + 6); y += 12; }
  }
  if (!st.tiesOut) {
    room(20);
    ink(AMBER); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
    at("This statement is under review — please contact us before remitting.", L + 6); y += 12;
  }

  footer();
}

export const PAGE_SIZE = { PAGE_W, PAGE_H };
