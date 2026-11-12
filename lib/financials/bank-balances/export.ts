// Bank balances — the weekly cash report for ownership, as Excel and PDF.
// Both are built from the SAME view the page renders (`buildBalanceView`), so
// a download can never disagree with the screen.
//
// Excel: the shared theme (`lib/excel/theme.ts`). Each line's Net available is
// a live `=Balance − Reserves`, each group's subtotal a `SUM` of its own lines,
// and the grand total adds the SUBTOTALS (`liveAdd`) — never the lines again.
// A second sheet lists every account behind the figures.

import "server-only";
import { jsPDF } from "jspdf";
import { useHanken } from "@/lib/pdf/fonts/hankenGrotesk";
import { COLOR, FMT, FONT_NAME, PRINT_TALL, footNote, freezeAbove, headerBand, liveAdd, liveFormula, liveSum, newWorkbook, repeatHeader, sectionBar, titleBlock, totalEmphasis } from "@/lib/excel/theme";
import type { BalanceView, ViewRow } from "./view";
import { cell as kCell, cellSigned, headline, total, totalSigned } from "./compact";

const BANK: Record<string, string> = { "JPM-Chase": "Chase", "Liberty Bank": "Liberty", "M&T": "M&T" };

export const BASIS_NOTE =
  "Bank balances are each bank's ledger figure on the date shown (Chase Present balance, Liberty Current Balance, M&T Closing Ledger). " +
  "Reserves are the budgeted Big Projects for this month and the next two, or the figure entered over them. Tenant security deposits are " +
  "tenants' money and are held back in full. The Leonard Korman Trust (Liberty x9245) is LIK money, hands off: not imported weekly, its balance is the last statement accrued at its rate (compounded daily, less the monthly charge) and it is held back in full. Debt service is each loan's next monthly payment including escrow, per the Debt Tracker, shown for " +
  "context and not deducted from net available cash. Week over week compares each account with its balance from the import at least five days earlier; " +
  "a line is compared only when every one of its accounts has that figure. Unaudited.";

/** The PDF's short version of BASIS_NOTE (the Excel keeps the full one). */
export const PDF_NOTE =
  "Each bank's ledger balance on the date shown. Reserves are the budgeted big projects for this month and the next two. Security deposits " +
  "(tenants' money) and the Leonard Korman Trust are held back in full. Debt service is each loan's next payment including escrow, shown for " +
  "context, not deducted. Week over week compares the import at least five days earlier. $10K and up rounded to the nearest thousand. Unaudited.";

export function asOfOf(v: BalanceView): string | null {
  return v.byBank.map((b) => b.asOf).filter((d): d is string => !!d).sort().pop() ?? null;
}
const longDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

function grouped(v: BalanceView) {
  return v.groups.map((g) => ({ g, rows: v.rows.filter((r) => r.group === g) })).filter((x) => x.rows.length);
}
const accountsLabel = (r: ViewRow) => r.accounts.map((a) => `${BANK[a.bank] ?? a.bank} ${a.last4}`).join(", ");
const num = (n: number | null) => (n == null ? 0 : n);

export async function buildBalanceXlsx(v: BalanceView): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Cash Position", { pageSetup: PRINT_TALL, views: [{ showGridLines: false }] });
  const W = 8;
  // A name · B accounts · C balance · D last week · E change (=C−D) · F reserves · G net (=C−F) · H debt
  ws.columns = [{ width: 36 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 15 }, { width: 14 }, { width: 16 }, { width: 16 }];
  const asOf = asOfOf(v);
  const priorDates = v.rows.map((x) => x.priorAsOf).filter((d): d is string => !!d).sort();
  let r = titleBlock(ws, {
    entity: "Korman Commercial Properties", document: "Cash Position — Bank Balances",
    asOf: asOf ? `As of ${longDate(asOf)}` : null,
    meta: v.byBank.map((b) => `${BANK[b.bank] ?? b.bank} as of ${longDate(b.asOf)}`)
      .concat(priorDates.length ? [`Week over week vs ${longDate(priorDates[0])}`] : [])
      .concat(`Prepared ${new Date().toLocaleDateString("en-US")}`),
    width: W,
  });
  r++;
  const head = r;
  headerBand(ws, r++, ["Property / Entity", "Accounts", "Current Balance", "Last Week", "Wk / Wk Change", "Reserves", "Net Available", "Debt Service / Mo"]);
  freezeAbove(ws, r);
  repeatHeader(ws, head);

  type L = "C" | "D" | "E" | "F" | "G" | "H";
  const COLS: L[] = ["C", "D", "E", "F", "G", "H"];
  const subCells = Object.fromEntries(COLS.map((c) => [c, [] as string[]])) as Record<L, string[]>;
  const subVals = Object.fromEntries(COLS.map((c) => [c, [] as number[]])) as Record<L, number[]>;
  for (const { g, rows } of grouped(v)) {
    sectionBar(ws, r++, g, W, { strong: false });
    const first = r;
    for (const row of rows) {
      const bal = num(row.balance), res = row.balance == null ? 0 : row.reserves;
      ws.getCell(r, 1).value = row.name;
      ws.getCell(r, 2).value = accountsLabel(row);
      ws.getCell(r, 3).value = row.balance;
      if (row.change != null && row.priorBalance != null) {
        ws.getCell(r, 4).value = row.priorBalance;
        ws.getCell(r, 5).value = liveFormula(`C${r}-D${r}`, row.change, bal - row.priorBalance);
      }
      ws.getCell(r, 6).value = res;
      ws.getCell(r, 7).value = row.balance == null ? null : liveFormula(`C${r}-F${r}`, bal - res, bal - res);
      ws.getCell(r, 8).value = row.debtService;
      for (let c = 1; c <= W; c++) ws.getCell(r, c).font = { name: FONT_NAME, size: 10, color: { argb: c === 8 || c === 4 ? COLOR.muted : COLOR.text } };
      ws.getCell(r, 2).font = { name: FONT_NAME, size: 9, color: { argb: COLOR.muted } };
      r++;
    }
    const last = r - 1;
    ws.getCell(r, 1).value = `Total ${g}`;
    const col = (Lc: L, vals: number[]) => {
      const total = vals.reduce((t, x) => t + x, 0);
      const cell = ws.getCell(`${Lc}${r}`);
      cell.value = liveSum(`${Lc}${first}:${Lc}${last}`, total, vals);
      totalEmphasis(cell);
      subCells[Lc].push(`${Lc}${r}`); subVals[Lc].push(total);
    };
    const compared = (x: ViewRow) => x.change != null && x.priorBalance != null;
    col("C", rows.map((x) => num(x.balance)));
    col("D", rows.map((x) => (compared(x) ? num(x.priorBalance) : 0)));
    col("E", rows.map((x) => (compared(x) ? num(x.change) : 0)));
    col("F", rows.map((x) => (x.balance == null ? 0 : x.reserves)));
    col("G", rows.map((x) => (x.balance == null ? 0 : num(x.balance) - x.reserves)));
    col("H", rows.map((x) => num(x.debtService)));
    totalEmphasis(ws.getCell(r, 1));
    r += 2;
  }
  ws.getCell(r, 1).value = "Total — All Properties";
  totalEmphasis(ws.getCell(r, 1), { grand: true });
  for (const Lc of COLS) {
    const cell = ws.getCell(`${Lc}${r}`);
    const total = subVals[Lc].reduce((t, x) => t + x, 0);
    cell.value = liveAdd(subCells[Lc], total, subVals[Lc]);
    totalEmphasis(cell, { grand: true });
  }
  for (let rr = head + 1; rr <= r; rr++) for (const c of [3, 4, 5, 6, 7, 8]) ws.getCell(rr, c).numFmt = FMT.money;
  r += 2;
  footNote(ws, r, BASIS_NOTE, W, 56);

  // Every account behind the figures.
  const wa = wb.addWorksheet("Accounts", { pageSetup: PRINT_TALL, views: [{ showGridLines: false }] });
  wa.columns = [{ width: 10 }, { width: 10 }, { width: 40 }, { width: 32 }, { width: 17 }, { width: 17 }, { width: 13 }];
  let a = titleBlock(wa, { entity: "Korman Commercial Properties", document: "Bank Accounts", asOf: asOf ? `As of ${longDate(asOf)}` : null, width: 7 });
  a++;
  const ah = a;
  headerBand(wa, a++, ["Bank", "Account", "Account Name", "Property / Entity", "Balance", "Available", "As of"]);
  freezeAbove(wa, a);
  repeatHeader(wa, ah);
  const af = a;
  const bals: number[] = [];
  for (const row of v.rows) for (const acct of row.accounts) {
    wa.getCell(a, 1).value = BANK[acct.bank] ?? acct.bank;
    wa.getCell(a, 2).value = acct.last4;
    wa.getCell(a, 3).value = acct.name;
    wa.getCell(a, 4).value = row.name;
    wa.getCell(a, 5).value = acct.balance;
    wa.getCell(a, 6).value = acct.available;
    wa.getCell(a, 7).value = acct.asOf ? new Date(`${acct.asOf}T12:00:00`) : null;
    wa.getCell(a, 5).numFmt = FMT.moneyCents; wa.getCell(a, 6).numFmt = FMT.moneyCents; wa.getCell(a, 7).numFmt = FMT.date;
    bals.push(num(acct.balance));
    a++;
  }
  wa.getCell(a, 1).value = "Total";
  totalEmphasis(wa.getCell(a, 1), { grand: true });
  const t = wa.getCell(a, 5);
  t.value = liveSum(`E${af}:E${a - 1}`, Math.round(bals.reduce((s, x) => s + x, 0) * 100) / 100, bals);
  t.numFmt = FMT.moneyCents;
  totalEmphasis(t, { grand: true });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── PDF — the cash sheet's own look (brand header band, tinted group bars) ──
const fmt0 = (n: number | null) => {
  if (n == null) return "—";
  const v = Math.round(n);
  if (v === 0) return "—";
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
};

// The PDF is the attachment to the Monday Cash Position email, so it reads
// as the same document (owner, 11/2026: "make both look good and together"):
// the portal's look — the KORMAN | COMMERCIAL PROPERTIES masthead, the title,
// net available big in navy with the other figures beside it, then the table
// with caps grey headings, hairline rows, a light band per group, no $ in a
// cell, negatives in (parens), zero as a dash, totals bold under a 2pt rule.
export function buildBalancePdf(v: BalanceView): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  useHanken(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 36;
  const W = pageW - m * 2;
  const NAVY: [number, number, number] = [11, 74, 125], INK: [number, number, number] = [16, 24, 40], MUTED: [number, number, number] = [102, 112, 133];
  const HAIR: [number, number, number] = [234, 236, 240], BORDER: [number, number, number] = [228, 231, 236], BAND: [number, number, number] = [244, 246, 249];
  const GOOD: [number, number, number] = [6, 118, 71], BAD: [number, number, number] = [180, 35, 24];
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const nameW = 196;
  const heads = ["Balance", "Wk / Wk", "Reserves", "Net Available", "Debt Svc / Mo"];
  const numW = (W - nameW) / heads.length;
  const colX = (i: number) => m + nameW + (i + 1) * numW;
  const asOf = asOfOf(v);
  const short = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
  // Cells: no $, (parens), dash for zero. Totals and figures: with $.
  // Big picture: K from $10,000, M on the headline figures (compact.ts).
  const cell = kCell;
  const dollars = headline;
  const signedCell = cellSigned;
  let y = m;

  // Masthead.
  // Letter-spaced caps: jsPDF leaves charSpace out of a text's width, so the
  // spacing is added by hand and right-aligned text is placed from its left.
  const spaced = (t: string, x: number, yy: number, cs: number, right = false) => {
    doc.setCharSpace(0);
    const w = doc.getTextWidth(t) + cs * (t.length - 1);
    doc.setCharSpace(cs);
    doc.text(t, right ? x - w : x, yy);
    doc.setCharSpace(0);
    return w;
  };
  doc.setFont("Hanken", "bold"); doc.setFontSize(9.5); color(NAVY);
  const kw = spaced("KORMAN", m, y + 8, 1.6);
  doc.setFont("Hanken", "normal"); color(MUTED);
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.6); doc.line(m + kw + 7, y + 0.5, m + kw + 7, y + 9.5);
  spaced("COMMERCIAL PROPERTIES", m + kw + 14, y + 8, 1.2);
  doc.setFont("Hanken", "bold"); doc.setFontSize(8); spaced("CASH POSITION", pageW - m, y + 8, 1.2, true);
  y += 30;

  // Title and meta.
  const monday = (() => { if (!asOf) return null; const d = new Date(`${asOf}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  doc.setFont("HankenXB", "normal"); doc.setFontSize(20); color(INK);
  doc.text(monday ? `Week of ${monday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "Cash Position", m, y);
  y += 16;
  const prior = v.rows.map((x) => x.priorAsOf).filter((d): d is string => !!d).sort()[0] ?? null;
  doc.setFont("Hanken", "normal"); doc.setFontSize(9); color(MUTED);
  doc.text([`Balances as of ${longDate(asOf)}`, v.byBank.map((b) => `${BANK[b.bank] ?? b.bank} ${short(b.asOf)}`).join(" · "), prior ? `Week over week vs ${short(prior)}` : ""].filter(Boolean).join("   ·   "), m, y);
  y += 20;

  // Figures: net available big, the rest in a row beside it.
  const ops = v.rows.filter((r) => !r.restricted);
  const totalCash = v.rows.reduce((t, r) => t + num(r.balance), 0);
  const deposits = v.rows.filter((r) => r.restricted).reduce((t, r) => t + num(r.balance), 0);
  const reserves = ops.reduce((t, r) => t + (r.balance == null ? 0 : r.reserves), 0);
  const net = ops.reduce((t, r) => t + num(r.netAvailable), 0);
  const debt = v.rows.reduce((t, r) => t + num(r.debtService), 0) + (v.unplacedDebtService ?? 0);
  const compared = v.rows.filter((r) => r.change != null);
  const change = compared.length ? compared.reduce((t, r) => t + num(r.change), 0) : null;
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.8); doc.line(m, y, pageW - m, y);
  y += 22;
  doc.setFont("HankenXB", "normal"); doc.setFontSize(28); color(NAVY); doc.text(dollars(net), m, y + 6);
  doc.setFont("Hanken", "bold"); doc.setFontSize(8); color(MUTED); doc.text("Net available", m, y + 20);
  const stats: [string, string, [number, number, number]][] = [
    ["Cash in bank", dollars(totalCash), INK],
    ["Week over week", change == null ? "—" : change < 0 ? dollars(change) : `+${dollars(change)}`, change == null ? INK : change < 0 ? BAD : GOOD],
    ["Security deposits", dollars(deposits), INK],
    ["Reserves", dollars(reserves), INK],
    ["Debt service / mo", dollars(debt), INK],
  ];
  const sx0 = m + 170, sw = (pageW - m - sx0) / stats.length;
  stats.forEach(([label, val, c], i) => {
    const x = sx0 + i * sw;
    doc.setDrawColor(...HAIR); doc.line(x, y - 14, x, y + 22);
    doc.setFont("Hanken", "bold"); doc.setFontSize(11); color(c); doc.text(val, x + 9, y + 2);
    doc.setFont("Hanken", "normal"); doc.setFontSize(7.5); color(MUTED); doc.text(label, x + 9, y + 15);
  });
  y += 34;

  const drawHead = () => {
    doc.setFont("Hanken", "bold"); doc.setFontSize(7); color(MUTED);
    spaced("PROPERTY / ENTITY", m, y + 9, 0.5);
    heads.forEach((h, i) => spaced(h.toUpperCase(), colX(i), y + 9, 0.5, true));
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.8); doc.line(m, y + 14, pageW - m, y + 14);
    y += 14;
  };
  const ensure = (h: number) => { if (y + h > pageH - m) { doc.addPage(); y = m; drawHead(); } };
  const nums = (vals: (number | null)[], bold: boolean, rowH: number) => {
    doc.setFont("Hanken", bold ? "bold" : "normal"); doc.setFontSize(9.5);
    vals.forEach((val, i) => {
      color(INK);
      let text = cell(val);
      if (i === 1) { text = signedCell(val); if (val != null && Math.round(val) !== 0) color(val < 0 ? BAD : GOOD); }
      if (i === 4) color(MUTED);
      doc.text(text, colX(i), y + rowH / 2 + 3, { align: "right" });
    });
    color(INK);
  };
  const changeSum = (rs: ViewRow[]) => (rs.some((x) => x.change != null) ? rs.reduce((t, x) => t + num(x.change), 0) : null);

  drawHead();
  for (const { g, rows } of grouped(v)) {
    ensure(16 + 14);
    y += 3;
    doc.setFillColor(...BAND); doc.rect(m, y, W, 16, "F");
    doc.setFont("Hanken", "bold"); doc.setFontSize(9.5); color(INK); doc.text(g, m + 6, y + 11);
    const restricted = rows.every((r) => r.restricted);
    nums([
      rows.reduce((t, r) => t + num(r.balance), 0),
      changeSum(rows),
      rows.reduce((t, r) => t + (r.balance == null ? 0 : r.reserves), 0),
      restricted ? null : rows.reduce((t, r) => t + num(r.netAvailable), 0),
      rows.some((r) => r.debtService != null) ? rows.reduce((t, r) => t + num(r.debtService), 0) : null,
    ], true, 16);
    y += 16;
    for (const r of rows) {
      ensure(14);
      doc.setFont("Hanken", "normal"); doc.setFontSize(9.5); color(INK);
      doc.text(r.name.length > 40 ? r.name.slice(0, 39) + "…" : r.name, m + 12, y + 10);
      nums([r.balance, r.change, r.balance == null ? null : r.reserves, r.restricted ? null : r.netAvailable, r.debtService], false, 13.6);
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.5); doc.line(m, y + 14, pageW - m, y + 14);
      y += 14;
    }
  }
  ensure(26);
  y += 6;
  doc.setDrawColor(...INK); doc.setLineWidth(1.6); doc.line(m, y, pageW - m, y);
  doc.setFont("Hanken", "bold"); doc.setFontSize(10); color(INK); doc.text("Total", m, y + 14);
  const tot: (number | null)[] = [totalCash, changeSum(v.rows), reserves + deposits, net, debt];
  tot.forEach((val, i) => {
    color(i === 1 && val != null && Math.round(val) !== 0 ? (val < 0 ? BAD : GOOD) : i === 4 ? MUTED : INK);
    const t = i === 1 ? totalSigned(val) : total(val);
    doc.text(t, colX(i), y + 14, { align: "right" });
  });
  y += 26;

  ensure(40);
  doc.setFont("Hanken", "normal"); doc.setFontSize(7.5); color(MUTED);
  doc.text(doc.splitTextToSize(PDF_NOTE, W), m, y);
  color(INK);
  return Buffer.from(doc.output("arraybuffer"));
}
