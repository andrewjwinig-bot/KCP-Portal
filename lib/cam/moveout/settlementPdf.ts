// The move-out FINAL BILL pages — drawn by the server's final PDF
// (artifacts.ts) and the move-out page's own download, so the two are the same
// document. Client-safe: no storage, types only from the server modules.
//
// The document follows the settlement's own order (owner: "keep the detail in
// the same order as its listed on the final settlement"):
//   1. Final Settlement — the answer (drawSettlement)
//   2. the reconciliation — drawn by the statement renderers
//   3. Unpaid Charges — every open charge (drawUnpaidDetail)
//   4. Security Deposit — the record and its check image (drawDepositDetail)

import type { MoveoutSettlement } from "./deposit";
import { escrowNote } from "./openAr";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type SettlementHeader = {
  kind: "retail" | "office"; name: string; suite: string;
  property: string; propertyName: string; asOfMonth: number; year: number;
};

/** The deposit behind line 3, for its own page. `image` is a data URL of the
 *  check (JPEG / PNG); a scan in another format is named, not drawn. */
export type DepositDetail = {
  checkNumber?: string; checkDate?: string; notes?: string;
  image?: { dataUrl: string; format: "JPEG" | "PNG" } | null;
  imageName?: string | null; imageType?: string | null;
};

const money2 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateUS = (iso: string | null | undefined) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : null;
};

const PAGE_W = 612, L = 48, R = 564, W = R - L;
const NAVY = [11, 74, 125], TINT = [230, 238, 245], MUTED = [110, 110, 110], INK = [20, 20, 20];
const LINE = [205, 210, 216], GREEN = [21, 128, 61], AMBER = [180, 83, 9];

/** The shared letterhead + drawing helpers for one page. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page(doc: any, c: SettlementHeader, title: string, footerText: string) {
  const fill = (k: number[]) => doc.setFillColor(k[0], k[1], k[2]);
  const ink = (k: number[]) => doc.setTextColor(k[0], k[1], k[2]);
  const stroke = (k: number[]) => doc.setDrawColor(k[0], k[1], k[2]);
  const st = { y: 0 };
  const at = (t: string, x: number, o?: { align?: "right" }) => doc.text(t, x, st.y, o);

  const letterhead = () => {
    fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
    ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("KORMAN", L, 46);
    stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(title, R, 38, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(`Move-Out · ${MONTHS[c.asOfMonth - 1]} ${c.year}`, R, 54, { align: "right" });
    st.y = 112; ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(15); at(c.name, L);
    st.y += 16; ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    at(`${c.property} — ${c.propertyName}   ·   Suite ${c.suite}`, L);
    st.y += 30;
  };
  const footer = () => {
    stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
    ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("Invoices available, upon request.", L, 766);
    doc.text(footerText, R, 766, { align: "right" });
  };
  const bar = (t: string) => { fill(TINT); doc.rect(L, st.y - 11, W, 18, "F"); ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9); at(t.toUpperCase(), L + 6); st.y += 22; doc.setFontSize(10); };
  const row = (label: string, value: string, o: { bold?: boolean; indent?: boolean } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(o.bold ? 10.5 : 10);
    ink(o.bold ? INK : MUTED); at(label, L + (o.indent ? 18 : 6)); ink(INK); at(value, R - 6, { align: "right" }); st.y += 15;
  };
  const rule = () => { stroke(LINE); doc.setLineWidth(0.6); doc.line(L + 6, st.y - 9, R - 6, st.y - 9); st.y += 4; };
  const note = (t: string, x = L + 18) => {
    ink(MUTED); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
    for (const ln of doc.splitTextToSize(t, R - x)) { at(ln, x); st.y += 11; }
    st.y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  };
  /** Continue on a fresh page when `need` points will not fit above the footer. */
  const room = (need: number, onBreak?: () => void) => {
    if (st.y + need <= 740) return;
    footer(); doc.addPage(); letterhead(); onBreak?.();
  };
  return { st, at, fill, ink, stroke, letterhead, footer, bar, row, rule, note, room };
}

/** 1 · FINAL SETTLEMENT — the answer: the true-up, the unpaid charges, the
 *  deposit applied, and what is left. Each line's detail follows in order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawSettlement(doc: any, c: SettlementHeader, s: MoveoutSettlement) {
  const p = page(doc, c, "Final Settlement", `Final Settlement · Suite ${c.suite}`);
  p.letterhead();
  const cats = c.kind === "retail" ? "CAM / INS / RET" : "CAM / RET";
  const ar = s.openAr;
  const dep = s.deposit;

  p.bar("Final Settlement");
  p.row(`1 · ${cats} reconciliation${s.reconBalance < 0 ? " — credit" : ""}`, money2(s.reconBalance), { indent: true });
  if (ar) p.row(`2 · Unpaid charges on account${dateUS(ar.asOf) ? ` as of ${dateUS(ar.asOf)}` : ""}`, money2(ar.balance), { indent: true });
  else p.row("2 · Unpaid charges — no statement on file", "—", { indent: true });
  p.rule();
  p.row("Total due", money2(s.totalDue), { bold: true });
  if (dep && dep.net != null) {
    p.row(`3 · Less security deposit${dep.status === "partial" ? " (partially refunded)" : ""}`, money2(-dep.amount), { indent: true });
    p.st.y += 4;
    // The reconciliation statement's own net callout — same box, colours and
    // type, so the final bill and the CAM rec read as one document.
    const net = -dep.net; // >0 owed by the tenant
    const credit = net < 0;
    const theme = credit ? GREEN : AMBER;
    p.fill(credit ? [235, 247, 239] : [252, 245, 235]); p.stroke(theme); doc.setLineWidth(1.2);
    doc.rect(L, p.st.y, W, 46, "FD");
    p.ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(credit ? "NET REFUND DUE TO TENANT" : "NET BALANCE DUE FROM TENANT", L + 16, p.st.y + 20);
    doc.setFontSize(8); p.ink(MUTED);
    doc.text(`Reconciliation ${money2(s.reconBalance)}   ·   Unpaid ${money2(ar?.balance ?? 0)}   ·   Deposit ${money2(-dep.amount)}`, L + 16, p.st.y + 34);
    p.ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text(money2(Math.abs(net)), R - 16, p.st.y + 30, { align: "right" });
    p.st.y += 64;
  } else if (dep) {
    p.note(`3 · Security deposit of ${money2(dep.amount)} is ${dep.status === "held" && !(dep.amount > 0) ? "on file with no amount" : dep.status} — not applied here.`);
  } else {
    p.note("3 · No security deposit is on record for this suite.");
  }
  p.st.y += 14;
  p.note(`The pages that follow give the detail of each line, in this order: 1 the ${cats} reconciliation, 2 the unpaid charges${dep ? ", 3 the security deposit" : ""}.`, L);
  p.note("Unpaid charges are as of the date shown; payments received after that date are credited against the balance due.", L);
  p.footer();
}

/** 2 · UNPAID CHARGES — every open charge behind the open balance, in
 *  Skyline's printed order; † marks the estimates billed and not paid. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawUnpaidDetail(doc: any, c: SettlementHeader, s: MoveoutSettlement) {
  const ar = s.openAr;
  if (!ar) return;
  const p = page(doc, c, "Unpaid Charges", `Unpaid Charges · Suite ${c.suite}`);
  p.letterhead();
  p.bar(`2 · Unpaid Charges on Account${dateUS(ar.asOf) ? ` · as of ${dateUS(ar.asOf)}` : ""}`);
  const head = () => {
    p.ink(MUTED); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    p.at("DATE", L + 6); p.at("DESCRIPTION", L + 80); p.at("AMOUNT", R - 6, { align: "right" }); p.st.y += 13;
  };
  head();
  ar.charges.forEach((k, i) => {
    p.room(13, head);
    if (i % 2 === 1) { p.fill([247, 249, 251]); doc.rect(L, p.st.y - 9, W, 13, "F"); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); p.ink(INK);
    p.at(dateUS(k.dateISO) ?? "", L + 6);
    p.at(`${k.description}${k.escrow ? " †" : ""}`.slice(0, 80), L + 80);
    p.at(money2(k.amount), R - 6, { align: "right" });
    p.st.y += 13;
  });
  p.room(40);
  p.rule();
  p.row("Total unpaid charges", money2(ar.balance), { bold: true });
  const en = escrowNote(ar);
  if (en) p.note(`† ${en}`);
  p.footer();
}

/** 3 · SECURITY DEPOSIT — the record applied on the settlement, with the
 *  check itself when an image of it is on file. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawDepositDetail(doc: any, c: SettlementHeader, s: MoveoutSettlement, d: DepositDetail | null | undefined) {
  const dep = s.deposit;
  if (!dep) return;
  const p = page(doc, c, "Security Deposit", `Security Deposit · Suite ${c.suite}`);
  p.letterhead();
  p.bar("3 · Security Deposit");
  p.row("Amount", money2(dep.amount), { indent: true });
  if (d?.checkNumber) p.row("Check #", d.checkNumber, { indent: true });
  if (dateUS(d?.checkDate)) p.row("Check date", dateUS(d?.checkDate)!, { indent: true });
  const status = ({ held: "Held", partial: "Partially refunded", refunded: "Refunded", forfeited: "Applied / forfeited" } as Record<string, string>)[dep.status] ?? dep.status;
  p.row("Status", status, { indent: true });
  p.row(dep.net != null ? "Applied against the total due" : "Applied", dep.net != null ? money2(dep.amount) : "No", { bold: true });
  if (d?.notes) p.note(d.notes);
  p.st.y += 10;

  if (d?.image) {
    try {
      const props = doc.getImageProperties(d.image.dataUrl);
      const maxW = W, maxH = 740 - p.st.y;
      const scale = Math.min(maxW / props.width, maxH / props.height, 1.5);
      const w = props.width * scale, h = props.height * scale;
      p.stroke(LINE); doc.setLineWidth(0.6); doc.rect(L, p.st.y, w, h);
      doc.addImage(d.image.dataUrl, d.image.format, L, p.st.y, w, h);
      p.st.y += h + 12;
    } catch {
      p.note(`Check image on file (${d.imageName ?? "image"}) could not be drawn.`, L);
    }
  } else if (d?.imageName) {
    p.note(`Check scan on file: ${d.imageName}${d.imageType ? ` (${d.imageType})` : ""} — available on request.`, L);
  } else {
    p.note("No image of the check is on file.", L);
  }
  p.footer();
}
