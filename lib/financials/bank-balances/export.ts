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
import { COLOR, FMT, FONT_NAME, PRINT_TALL, footNote, freezeAbove, headerBand, liveAdd, liveFormula, liveSum, newWorkbook, repeatHeader, sectionBar, titleBlock, totalEmphasis } from "@/lib/excel/theme";
import type { BalanceView, ViewRow } from "./view";

const BANK: Record<string, string> = { "JPM-Chase": "Chase", "Liberty Bank": "Liberty", "M&T": "M&T" };

export const BASIS_NOTE =
  "Bank balances are each bank's ledger figure on the date shown (Chase Present balance, Liberty Current Balance, M&T Closing Ledger). " +
  "Reserves are the budgeted Big Projects for this month and the next two, or the figure entered over them. Tenant security deposits are " +
  "tenants' money and are held back in full. The Leonard Korman Trust (Liberty x9245) is LIK money, hands off: not imported weekly, its balance is the last statement accrued at its rate (compounded daily, less the monthly charge) and it is held back in full. Debt service is each loan's next monthly payment including escrow, per the Debt Tracker, shown for " +
  "context and not deducted from net available cash. Week over week compares each account with its balance from the import at least five days earlier; " +
  "a line is compared only when every one of its accounts has that figure. Unaudited.";

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

export function buildBalancePdf(v: BalanceView): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 36;
  const nameW = 186;
  const heads = ["Current Balance", "Wk / Wk Change", "Reserves", "Net Available", "Debt Svc / Mo"];
  const numW = (pageW - m * 2 - nameW) / heads.length;
  const colX = (i: number) => m + nameW + (i + 1) * numW - 4;
  const asOf = asOfOf(v);
  let y = m;

  doc.setFillColor(11, 74, 125); doc.rect(m, y, pageW - m * 2, 16, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255);
  doc.text("KORMAN  COMMERCIAL PROPERTIES", m + 6, y + 11);
  y += 26; doc.setTextColor(0);
  doc.setFontSize(15); doc.text("Cash Position — Bank Balances", m, y + 4); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(100);
  doc.text(`${asOf ? `As of ${longDate(asOf)}` : ""}   ·   ${v.byBank.map((b) => `${BANK[b.bank] ?? b.bank} ${longDate(b.asOf)}`).join("   ·   ")}`, m, y + 4);
  const priorDates = v.rows.map((x) => x.priorAsOf).filter((d): d is string => !!d).sort();
  if (priorDates.length) { y += 11; doc.text(`Week over week vs ${longDate(priorDates[0])}`, m, y + 4); }
  doc.setTextColor(0); y += 18;

  // KPI line.
  const ops = v.rows.filter((r) => !r.restricted);
  const totalCash = v.rows.reduce((s, r) => s + num(r.balance), 0);
  const deposits = v.rows.filter((r) => r.restricted).reduce((s, r) => s + num(r.balance), 0);
  const reserves = ops.reduce((s, r) => s + (r.balance == null ? 0 : r.reserves), 0);
  const net = ops.reduce((s, r) => s + num(r.netAvailable), 0);
  const debt = v.rows.reduce((s, r) => s + num(r.debtService), 0) + (v.unplacedDebtService ?? 0);
  const tiles: [string, number][] = [["Cash in Bank", totalCash], ["Security Deposits", deposits], ["Reserves", reserves], ["Net Available", net], ["Debt Service / Mo", debt]];
  const tw = (pageW - m * 2 - 4 * 6) / 5;
  tiles.forEach(([label, val], i) => {
    const x = m + i * (tw + 6);
    doc.setDrawColor(i === 3 ? 11 : 200, i === 3 ? 74 : 208, i === 3 ? 125 : 218); doc.setLineWidth(i === 3 ? 1.2 : 0.6);
    doc.roundedRect(x, y, tw, 38, 4, 4, "S");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(fmt0(val), x + tw / 2, y + 18, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100); doc.text(label, x + tw / 2, y + 30, { align: "center" }); doc.setTextColor(0);
  });
  y += 50;

  const drawHead = () => {
    doc.setFillColor(11, 74, 125); doc.rect(m, y, pageW - m * 2, 16, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255);
    doc.text("Property / Entity", m + 5, y + 11);
    heads.forEach((h, i) => doc.text(h, colX(i), y + 11, { align: "right" }));
    doc.setTextColor(0); y += 16;
  };
  const ensure = (h: number) => { if (y + h > pageH - m - 40) { doc.addPage(); y = m; drawHead(); } };
  // Column 1 is the week-over-week change: signed, green up / red down.
  const nums = (vals: (number | null)[], bold: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(8);
    vals.forEach((val, i) => {
      let text = fmt0(val);
      if (i === 1 && val != null) {
        const n = Math.round(val);
        if (n > 0) { doc.setTextColor(21, 128, 61); text = `+${fmt0(n)}`; }
        else if (n < 0) doc.setTextColor(185, 28, 28);
      }
      if (i === 4) doc.setTextColor(110);
      doc.text(text, colX(i), y + 9.5, { align: "right" });
      doc.setTextColor(0);
    });
  };
  const changeSum = (rs: ViewRow[]) => (rs.some((x) => x.change != null) ? rs.reduce((t, x) => t + num(x.change), 0) : null);

  drawHead();
  for (const { g, rows } of grouped(v)) {
    ensure(15);
    doc.setFillColor(230, 238, 245); doc.rect(m, y, pageW - m * 2, 14, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(g.toUpperCase(), m + 5, y + 9.5);
    const restricted = rows.every((r) => r.restricted);
    nums([
      rows.reduce((s, r) => s + num(r.balance), 0),
      changeSum(rows),
      rows.reduce((s, r) => s + (r.balance == null ? 0 : r.reserves), 0),
      restricted ? null : rows.reduce((s, r) => s + num(r.netAvailable), 0),
      rows.some((r) => r.debtService != null) ? rows.reduce((s, r) => s + num(r.debtService), 0) : null,
    ], true);
    y += 14;
    for (const r of rows) {
      ensure(13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(r.name.length > 38 ? r.name.slice(0, 37) + "…" : r.name, m + 10, y + 9.5);
      nums([r.balance, r.change, r.balance == null ? null : r.reserves, r.restricted ? null : r.netAvailable, r.debtService], false);
      doc.setDrawColor(230); doc.setLineWidth(0.4); doc.line(m, y + 13, pageW - m, y + 13);
      y += 13;
    }
  }
  ensure(20);
  doc.setDrawColor(11, 74, 125); doc.setLineWidth(1); doc.line(m, y + 2, pageW - m, y + 2);
  y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Total — All Properties", m + 5, y + 9.5);
  nums([totalCash, changeSum(v.rows), reserves + deposits, net, debt], true);
  y += 22;

  ensure(40);
  doc.setFont("helvetica", "italic"); doc.setFontSize(6.8); doc.setTextColor(110);
  doc.text(doc.splitTextToSize(BASIS_NOTE, pageW - m * 2), m, y);
  doc.setTextColor(0);

  return Buffer.from(doc.output("arraybuffer"));
}
