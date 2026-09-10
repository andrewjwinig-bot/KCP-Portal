// Excel + PDF for the balance sheet.
//
// Every total is a LIVE FORMULA over the exact cells above it, never a number
// computed here and dropped in: a group total sums its own accounts, the
// section total sums the GROUP totals (summing the accounts again would
// double-count, the same trap the 1099 register documents), and the workbook
// carries its own proof row — total assets minus total liabilities and
// capital — so the thing that makes a balance sheet trustworthy survives being
// opened, edited and re-saved by whoever receives it.

import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { drawKormanLogo, KORMAN_TEXT } from "@/lib/financials/exportBrand";
import type { BalanceSheet } from "./compute";

const MONEY_FMT = '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)';
const BRAND = "FF0B4A7D";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type BsMeta = { entityName: string; propertyName: string; ein: string | null };

export function asOfLabel(s: BalanceSheet): string {
  const day = new Date(Date.UTC(s.year, s.asOfMonth, 0)).getUTCDate();
  return `${MONTHS[s.asOfMonth - 1]} ${day}, ${s.year}`;
}

const BASIS =
  "Prepared from the partnership's general ledger on the basis of accounting the partnership uses to keep its " +
  "books, which is not necessarily accounting principles generally accepted in the United States. Real estate is " +
  "carried at cost less accumulated depreciation, not at market or appraised value. Unaudited; not reviewed or " +
  "compiled by an independent accountant.";

/** Sections in presentation order, with the extra net-income line. */
function sections(s: BalanceSheet) {
  return [
    { title: "ASSETS", groups: s.assets, total: s.totalAssets, totalLabel: "TOTAL ASSETS", extra: null as null | { label: string; amount: number } },
    { title: "LIABILITIES", groups: s.liabilities, total: s.totalLiabilities, totalLabel: "Total liabilities", extra: null },
    {
      title: "PARTNERS' CAPITAL", groups: s.equity, total: s.totalEquity,
      totalLabel: "Total partners' capital",
      extra: { label: `Net income (loss) — ${s.year}`, amount: s.netIncome },
    },
  ];
}

export async function balanceSheetXlsx(s: BalanceSheet, meta: BsMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Korman Commercial Properties";
  // Excel recalculates every formula the moment the file opens.
  //
  // Not cosmetic: ExcelJS DROPS a cached result of 0 when it writes a formula
  // cell (verified — `{formula, result: 0}` round-trips back as `{formula}`
  // alone), and the one cell that is meant to read zero is the proof. Without
  // this the balance sheet's own evidence that it balances would open blank.
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet("Balance Sheet", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 14 }, { width: 52 }, { width: 18 }];

  let r = 1;
  const put = (col: number, row: number, value: ExcelJS.CellValue, font?: Partial<ExcelJS.Font>, numFmt?: string) => {
    const c = ws.getCell(row, col);
    c.value = value;
    if (font) c.font = font;
    if (numFmt) { c.numFmt = numFmt; c.alignment = { horizontal: "right" }; }
    return c;
  };

  put(1, r++, KORMAN_TEXT, { size: 9, bold: true, color: { argb: BRAND } });
  put(1, r++, meta.entityName, { size: 14, bold: true });
  if (meta.propertyName && meta.propertyName !== meta.entityName) put(1, r++, meta.propertyName, { size: 10, color: { argb: "FF666666" } });
  put(1, r++, "Balance Sheet", { size: 12, bold: true });
  put(1, r++, `As of ${asOfLabel(s)}`, { size: 10, color: { argb: "FF666666" } });
  if (meta.ein) put(1, r++, `EIN ${meta.ein}`, { size: 9, color: { argb: "FF666666" } });
  r++;

  // Rows carrying a SECTION total, so the final proof sums the right cells.
  const sectionTotalRows: Record<string, number> = {};

  for (const sec of sections(s)) {
    const bar = ws.getRow(r);
    put(1, r, sec.title, { size: 10, bold: true, color: { argb: "FFFFFFFF" } });
    for (let c = 1; c <= 3; c++) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    bar.height = 18;
    r++;

    const groupTotalRows: number[] = [];
    for (const g of sec.groups) {
      put(2, r++, g.label, { size: 10, bold: true });
      const first = r;
      for (const a of g.accounts) {
        put(1, r, a.code, { size: 9, color: { argb: "FF666666" } });
        put(2, r, `    ${a.name || a.code}`, { size: 10 });
        put(3, r, a.amount, undefined, MONEY_FMT);
        r++;
      }
      const last = r - 1;
      // The group total is a live SUM over its own accounts. Written as a
      // formula only when it reconciles to the computed total, so an odd data
      // shape can never put a wrong number in front of a lender.
      const cell = ws.getCell(r, 3);
      const summed = g.accounts.reduce((t, a) => t + a.amount, 0);
      if (last >= first && Math.abs(summed - g.total) < 0.5) cell.value = { formula: `SUM(C${first}:C${last})`, result: g.total };
      else cell.value = g.total;
      cell.numFmt = MONEY_FMT;
      cell.font = { size: 10, bold: true };
      cell.border = { top: { style: "thin" } };
      put(2, r, `Total ${g.label.replace(/^Less: /, "").toLowerCase()}`, { size: 10, bold: true });
      groupTotalRows.push(r);
      r++;
      r++; // a blank line between groups
    }

    if (sec.extra) {
      put(2, r, sec.extra.label, { size: 10 });
      put(3, r, sec.extra.amount, undefined, MONEY_FMT);
      groupTotalRows.push(r);
      r++;
    }

    // The section total sums the GROUP totals, never the accounts again.
    put(2, r, sec.totalLabel, { size: 11, bold: true, color: { argb: BRAND } });
    const tc = ws.getCell(r, 3);
    const expr = groupTotalRows.map((x) => `C${x}`).join("+");
    const summed = groupTotalRows.reduce((t, x) => t + (Number((ws.getCell(x, 3).value as any)?.result ?? ws.getCell(x, 3).value) || 0), 0);
    if (expr && Math.abs(summed - sec.total) < 0.5) tc.value = { formula: expr, result: sec.total };
    else tc.value = sec.total;
    tc.numFmt = MONEY_FMT;
    tc.font = { size: 11, bold: true, color: { argb: BRAND } };
    tc.border = { top: { style: "thin" }, bottom: { style: "double" } };
    sectionTotalRows[sec.title] = r;
    r += 2;
  }

  // Total liabilities and partners' capital — the figure that must equal
  // total assets — as a formula over the two section totals.
  put(2, r, "TOTAL LIABILITIES AND PARTNERS' CAPITAL", { size: 11, bold: true, color: { argb: BRAND } });
  const lRow = sectionTotalRows["LIABILITIES"], eRow = sectionTotalRows["PARTNERS' CAPITAL"];
  const tle = ws.getCell(r, 3);
  if (lRow && eRow) tle.value = { formula: `C${lRow}+C${eRow}`, result: s.totalLiabilitiesAndEquity };
  else tle.value = s.totalLiabilitiesAndEquity;
  tle.numFmt = MONEY_FMT;
  tle.font = { size: 11, bold: true, color: { argb: BRAND } };
  tle.border = { top: { style: "thin" }, bottom: { style: "double" } };
  const tleRow = r;
  r += 2;

  // The proof, live in the workbook: it recalculates if anyone edits a figure.
  put(2, r, "Proof — total assets less total liabilities and partners' capital", { size: 9, italic: true, color: { argb: "FF666666" } });
  const aRow = sectionTotalRows["ASSETS"];
  const pc = ws.getCell(r, 3);
  if (aRow) pc.value = { formula: `C${aRow}-C${tleRow}`, result: s.proof.difference };
  else pc.value = s.proof.difference;
  pc.numFmt = MONEY_FMT;
  pc.font = { size: 9, bold: true, color: { argb: s.proof.balances ? "FF15803D" : "FFB91C1C" } };
  r += 2;

  if (s.unclassified.length) {
    put(1, r++, "Accounts not placed on this sheet — assign them before relying on it", { size: 9, bold: true, color: { argb: "FFB45309" } });
    for (const a of s.unclassified) {
      put(1, r, a.code, { size: 9 });
      put(2, r, a.name, { size: 9 });
      put(3, r, a.signed, undefined, MONEY_FMT);
      r++;
    }
    r++;
  }

  put(1, r, BASIS, { size: 8, italic: true, color: { argb: "FF666666" } });
  ws.getRow(r).height = 42;
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(r, 1, r, 3);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function balanceSheetPdf(s: BalanceSheet, meta: BsMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const brand = rgb(0.043, 0.29, 0.49);
  const muted = rgb(0.42, 0.45, 0.5);
  const W = 612, H = 792, M = 54;
  const RIGHT = W - M;

  let page = pdf.addPage([W, H]);
  let y = H - M;

  const money = (v: number) => {
    const n = Math.round(v);
    const t = Math.abs(n).toLocaleString("en-US");
    return n < 0 ? `(${t})` : t;
  };
  const right = (t: string, size: number, f = font, color = rgb(0, 0, 0)) => {
    page.drawText(t, { x: RIGHT - f.widthOfTextAtSize(t, size), y, size, font: f, color });
  };
  const centre = (t: string, size: number, f = font, color = rgb(0, 0, 0)) => {
    page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color });
  };
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const room = (n: number) => { if (y < M + n) newPage(); };

  drawKormanLogo(page, bold, font, { xRight: RIGHT, centerTop: M, color: brand, scale: 0.85 });
  y -= 34;
  centre(meta.entityName, 15, bold); y -= 16;
  if (meta.propertyName && meta.propertyName !== meta.entityName) { centre(meta.propertyName, 10, font, muted); y -= 14; }
  centre("Balance Sheet", 12, bold); y -= 14;
  centre(`As of ${asOfLabel(s)}`, 10, font, muted); y -= 12;
  if (meta.ein) { centre(`EIN ${meta.ein}`, 8.5, font, muted); y -= 12; }
  y -= 10;

  for (const sec of sections(s)) {
    room(80);
    page.drawRectangle({ x: M, y: y - 4, width: RIGHT - M, height: 17, color: brand });
    page.drawText(sec.title, { x: M + 7, y: y + 1, size: 9.5, font: bold, color: rgb(1, 1, 1) });
    y -= 26;

    for (const g of sec.groups) {
      room(40);
      page.drawText(g.label, { x: M + 6, y, size: 9.5, font: bold });
      y -= 14;
      for (const a of g.accounts) {
        room(18);
        page.drawText(a.code, { x: M + 18, y, size: 7.5, font, color: muted });
        const nm = a.name || a.code;
        page.drawText(nm.length > 52 ? nm.slice(0, 51) + "…" : nm, { x: M + 66, y, size: 9, font });
        right(money(a.amount), 9);
        y -= 13;
      }
      room(20);
      page.drawLine({ start: { x: RIGHT - 90, y: y + 9 }, end: { x: RIGHT, y: y + 9 }, thickness: 0.6, color: muted });
      page.drawText(`Total ${g.label.replace(/^Less: /, "").toLowerCase()}`, { x: M + 18, y, size: 9, font: bold });
      right(money(g.total), 9, bold);
      y -= 20;
    }

    if (sec.extra) {
      room(20);
      page.drawText(sec.extra.label, { x: M + 18, y, size: 9, font });
      right(money(sec.extra.amount), 9);
      y -= 16;
    }

    room(28);
    page.drawLine({ start: { x: M, y: y + 11 }, end: { x: RIGHT, y: y + 11 }, thickness: 0.8, color: brand });
    page.drawText(sec.totalLabel, { x: M + 6, y, size: 10, font: bold, color: brand });
    right(money(sec.total), 10, bold, brand);
    y -= 14;
    page.drawLine({ start: { x: RIGHT - 110, y: y + 8 }, end: { x: RIGHT, y: y + 8 }, thickness: 0.6, color: brand });
    page.drawLine({ start: { x: RIGHT - 110, y: y + 6 }, end: { x: RIGHT, y: y + 6 }, thickness: 0.6, color: brand });
    y -= 18;
  }

  room(50);
  page.drawRectangle({ x: M, y: y - 8, width: RIGHT - M, height: 24, borderColor: brand, borderWidth: 1 });
  page.drawText("TOTAL LIABILITIES AND PARTNERS' CAPITAL", { x: M + 8, y, size: 9.5, font: bold, color: brand });
  right(money(s.totalLiabilitiesAndEquity), 11, bold, brand);
  y -= 30;

  room(30);
  const ok = s.proof.balances;
  page.drawText(
    ok
      ? "Total assets equal total liabilities and partners' capital."
      : `Out of balance by $${Math.abs(s.proof.difference).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    { x: M, y, size: 8.5, font: italic, color: ok ? rgb(0.08, 0.5, 0.24) : rgb(0.73, 0.11, 0.11) },
  );
  y -= 22;

  // Basis of presentation — wrapped by hand, since pdf-lib has no text box.
  room(70);
  const words = BASIS.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, 7.5) > RIGHT - M) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  page.drawText("Basis of presentation", { x: M, y, size: 7.5, font: bold, color: muted });
  y -= 11;
  for (const l of lines) { room(14); page.drawText(l, { x: M, y, size: 7.5, font, color: muted }); y -= 10; }

  return pdf.save();
}
