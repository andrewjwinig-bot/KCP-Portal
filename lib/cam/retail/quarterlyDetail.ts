// The GL CHARGES behind a quarter's CAM and tax statement (owner: "save the GL
// charges detail … to send him if he asks so its already ready to go"). Each
// eligible line's transactions in the quarter's months, read from the parent
// property's GL — the same accounts `autoQuarterlyFromGl` sums — so every
// group's subtotal ties to the figure on the statement. A line typed over on
// the worksheet says so. Client-safe (pure + jsPDF); the server reads the GL.

import { jsPDF } from "jspdf";
import { quarterMonths, type Quarter, type QuarterlyBillingDef, type QuarterlyData } from "./quarterly";

export type DetailTxn = { date: string | null; month: number; vendor?: string; description: string; ref: string; amount: number };
export type DetailGroup = {
  label: string;
  account: string;
  kind: "cam" | "ret";
  txns: DetailTxn[];
  /** Sum of the transactions. */
  glTotal: number;
  /** The figure the statement uses (a typed override when there is one). */
  billed: number;
};
export type QuarterDetail = { quarter: Quarter; year: number; groups: DetailGroup[]; builtAt: string };

type Txn = { month: number; date: string | null; vendor?: string; description: string; ref: string; amount: number };

export function quarterDetail(
  def: QuarterlyBillingDef, q: Quarter, year: number,
  transactions: Record<string, Txn[]>, effective: QuarterlyData,
): QuarterDetail {
  const months = new Set(quarterMonths(q));
  const pick = (acct: string) => (transactions[acct] ?? [])
    .filter((t) => months.has(t.month))
    .map((t) => ({ date: t.date, month: t.month, vendor: t.vendor, description: t.description, ref: t.ref, amount: Math.round(t.amount * 100) / 100 }))
    .sort((a, b) => a.month - b.month || String(a.date ?? "").localeCompare(String(b.date ?? "")));
  const groups: DetailGroup[] = [];
  for (const label of def.camLines) {
    const account = def.camAccounts[label] ?? "";
    const txns = account ? pick(account) : [];
    const billed = effective.camCosts[label]?.[q] ?? 0;
    if (!txns.length && !billed) continue;
    groups.push({ label, account, kind: "cam", txns, glTotal: txns.reduce((a, t) => a + t.amount, 0), billed });
  }
  const retTx = pick(def.retAccount);
  const retBilled = effective.retCosts[q] ?? 0;
  if (retTx.length || retBilled) groups.push({ label: "Real Estate Taxes", account: def.retAccount, kind: "ret", txns: retTx, glTotal: retTx.reduce((a, t) => a + t.amount, 0), billed: retBilled });
  return { quarter: q, year, groups, builtAt: new Date().toISOString() };
}

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(t: DetailTxn): string {
  const m = t.date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : MON[t.month - 1];
}

/** The detail as a PDF in the quarterly statement's letterhead. */
export function buildQuarterlyDetailPdf(def: QuarterlyBillingDef, d: QuarterDetail): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const PAGE_W = 612, L = 40, R = 572, W = R - L;
  const NAVY: [number, number, number] = [11, 74, 125];
  const TINT: [number, number, number] = [230, 238, 245];
  const MUTED: [number, number, number] = [110, 110, 110];
  const INK: [number, number, number] = [20, 20, 20];
  const AMBER: [number, number, number] = [180, 83, 9];
  const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  let y = 0;
  const band = (first: boolean) => {
    fill(NAVY); doc.rect(0, 0, PAGE_W, first ? 70 : 40, "F");
    ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(first ? 20 : 12);
    doc.text("KORMAN", L, first ? 40 : 26);
    doc.setFontSize(first ? 13 : 10); doc.text("GL Detail — Quarterly CAM / RET", R, first ? 34 : 26, { align: "right" });
    if (first) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`${def.storeName} · ${d.quarter} ${d.year}`, R, 50, { align: "right" }); }
    y = first ? 96 : 64;
  };
  const room = (h: number) => { if (y + h > 740) { doc.addPage(); band(false); } };
  band(true);
  ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Every charge posted to the eligible expense accounts of ${def.parentProperty} in ${d.quarter} ${d.year}, from the general ledger.`, L, y); y += 20;

  for (const g of d.groups) {
    room(48);
    fill(TINT); doc.rect(L, y - 11, W, 18, "F");
    ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(`${g.account}  ${g.label}`.toUpperCase(), L + 6, y);
    doc.text(money(g.glTotal), R - 6, y, { align: "right" });
    y += 18; doc.setFontSize(8.5);
    if (!g.txns.length) { ink(MUTED); doc.setFont("helvetica", "italic"); doc.text("No GL charges this quarter.", L + 6, y); y += 13; }
    g.txns.forEach((t, i) => {
      room(13);
      if (i % 2 === 1) { fill([247, 249, 251]); doc.rect(L, y - 9, W, 13, "F"); }
      doc.setFont("helvetica", "normal"); ink(MUTED); doc.text(fmtDate(t), L + 6, y);
      ink(INK);
      const desc = [t.vendor, t.description].filter(Boolean).join(" — ");
      doc.text(doc.splitTextToSize(desc, 330)[0] ?? "", L + 56, y);
      ink(MUTED); doc.text(doc.splitTextToSize(t.ref ?? "", 70)[0] ?? "", L + 396, y);
      ink(INK); doc.text(money(t.amount), R - 6, y, { align: "right" });
      y += 13;
    });
    if (Math.abs(g.billed - g.glTotal) >= 1) {
      room(13); ink(AMBER); doc.setFont("helvetica", "bold");
      doc.text(`Statement uses ${money(g.billed)} for this line (adjusted from the GL's ${money(g.glTotal)}).`, L + 6, y); y += 13;
    }
    y += 8;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`Korman Commercial Properties · ${def.storeName} · ${d.quarter} ${d.year} GL detail`, L, 770);
    doc.text(`Page ${i} of ${pages}`, R, 770, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
