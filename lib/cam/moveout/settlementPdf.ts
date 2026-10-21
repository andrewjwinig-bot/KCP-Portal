// The FINAL SETTLEMENT page of a move-out statement — drawn by the server's
// final PDF (artifacts.ts) and the interim page's own download, so the two are
// the same page. Client-safe: no storage, types only from the server modules.

import type { MoveoutSettlement } from "./deposit";
import { escrowNote } from "./openAr";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type SettlementHeader = {
  kind: "retail" | "office"; name: string; suite: string;
  property: string; propertyName: string; asOfMonth: number; year: number;
};

const money2 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateUS = (iso: string | null) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : null;
};

/** Page 2 of the final statement: the FINAL SETTLEMENT — the true-up, every
 *  open charge still on the account, the deposit applied, and what is left.
 *  The close-out is the tenant's last bill, so it lists everything (owner);
 *  unpaid escrow already billed is named as such. Same letterhead, tint bars
 *  and boxed balance as the statement on page 1. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawSettlement(doc: any, c: SettlementHeader, s: MoveoutSettlement) {
  const meta = c;
  const PAGE_W = 612, L = 48, R = 564, W = R - L;
  const NAVY = [11, 74, 125], TINT = [230, 238, 245], MUTED = [110, 110, 110], INK = [20, 20, 20];
  const LINE = [205, 210, 216], GREEN = [21, 128, 61], RED = [185, 28, 28];
  const fill = (k: number[]) => doc.setFillColor(k[0], k[1], k[2]);
  const ink = (k: number[]) => doc.setTextColor(k[0], k[1], k[2]);
  const stroke = (k: number[]) => doc.setDrawColor(k[0], k[1], k[2]);
  let y = 0;
  const at = (t: string, x: number, o?: { align?: "right" }) => doc.text(t, x, y, o);

  fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
  ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("KORMAN", L, 46);
  stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Final Settlement", R, 38, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(`Move-Out · ${MONTHS[meta.asOfMonth - 1]} ${meta.year}`, R, 54, { align: "right" });

  y = 112; ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(15); at(c.name, L);
  y += 16; ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  at(`${meta.property} — ${meta.propertyName}   ·   Suite ${c.suite}`, L);
  y += 30;

  const bar = (t: string) => { fill(TINT); doc.rect(L, y - 11, W, 18, "F"); ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9); at(t.toUpperCase(), L + 6); y += 22; doc.setFontSize(10); };
  const row = (label: string, value: string, o: { bold?: boolean; indent?: boolean } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(o.bold ? 10.5 : 10);
    ink(o.bold ? INK : MUTED); at(label, L + (o.indent ? 18 : 6)); ink(INK); at(value, R - 6, { align: "right" }); y += 15;
  };
  const rule = () => { stroke(LINE); doc.setLineWidth(0.6); doc.line(L + 6, y - 9, R - 6, y - 9); y += 4; };
  const note = (t: string) => {
    ink(MUTED); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
    for (const ln of doc.splitTextToSize(t, W - 30)) { at(ln, L + 18); y += 11; }
    y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  };

  const cats = c.kind === "retail" ? "CAM / INS / RET" : "CAM / RET";
  bar(`1 · Final ${cats} Reconciliation`);
  row(s.reconBalance >= 0 ? "Due from tenant (page 1)" : "Credit to tenant (page 1)", money2(s.reconBalance), { bold: true });
  y += 8;

  const ar = s.openAr;
  bar(`2 · Open Balance on Account${ar && dateUS(ar.asOf) ? ` · as of ${dateUS(ar.asOf)}` : ""}`);
  if (ar) {
    for (const k of ar.byCategory) row(k.label, money2(k.amount), { indent: true });
    rule();
    row("Open balance", money2(ar.balance), { bold: true });
    const en = escrowNote(ar);
    if (en) note(en);
  } else {
    row("No monthly statement on file for this tenant", "—");
  }
  y += 8;

  bar("3 · Settlement");
  row(`Final reconciliation`, money2(s.reconBalance), { indent: true });
  if (ar) row(`Open balance`, money2(ar.balance), { indent: true });
  rule();
  row("Total due", money2(s.totalDue), { bold: true });
  const dep = s.deposit;
  if (dep && dep.net != null) {
    row(`Less security deposit${dep.status === "partial" ? " (partially refunded)" : ""}`, money2(-dep.amount), { indent: true });
    y += 10;
    const net = dep.net; // >0 refund, <0 still due
    const owed = net < 0;
    stroke(owed ? RED : GREEN); doc.setLineWidth(1.2); doc.rect(L, y - 17, W, 26);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); ink(owed ? RED : GREEN);
    at(owed ? "BALANCE DUE FROM TENANT" : "REFUND DUE TO TENANT", L + 10); at(money2(Math.abs(net)), R - 10, { align: "right" });
    y += 30;
  } else if (dep) {
    note(`Security deposit of ${money2(dep.amount)} is ${dep.status} — not applied here.`);
  } else {
    note("No security deposit is on record for this suite.");
  }

  y += 6; ink(MUTED); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
  for (const ln of doc.splitTextToSize("The open balance lists the charges still unpaid on your account as of the date shown; payments received after that date are credited against the balance due.", W)) { at(ln, L); y += 11; }
  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("Invoices available, upon request.", L, 766);
  doc.text(`Final Settlement · Suite ${c.suite}`, R, 766, { align: "right" });
}

