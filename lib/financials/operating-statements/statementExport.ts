// Excel + PDF exports for a property's Operating Statement — the Comparative
// Income Statement (Current Period + YTD Actual/Budget/Variance + Annual
// Budget). Excel via ExcelJS, PDF via pdf-lib, brand navy to match Budgets.

import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { PropertyStatement, StatementSection, StatementTotals } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONEY_FMT = '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)';

export type StatementMeta = { propertyCode: string; propertyName: string; year: number; period: number; budgetYear: number | null };

type Row =
  | { kind: "group"; label: string }
  | { kind: "line" | "subtotal" | "rollup"; label: string; t: StatementTotals; strong?: boolean };

const isZero = (v: number | null) => v == null || Math.abs(v) < 0.5;
const lineEmpty = (t: StatementTotals) => isZero(t.ytdActual) && isZero(t.ytdBudget) && isZero(t.periodActual);
function varPct(v: number | null, b: number | null): string {
  if (v == null || b == null || Math.abs(b) < 0.5) return "";
  const p = (v / Math.abs(b)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

export function statementRows(s: PropertyStatement): Row[] {
  const rows: Row[] = [];
  const byRole = (roles: string[]) => s.sections.filter((x) => roles.includes(x.role));
  const pushSection = (sec: StatementSection, withSubtotal = true) => {
    for (const l of sec.lines) if (!lineEmpty(l)) rows.push({ kind: "line", label: l.label, t: l });
    if (withSubtotal) rows.push({ kind: "subtotal", label: sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`, t: sec.subtotal });
  };
  const hasActivity = (secs: StatementSection[]) => secs.some((sec) => sec.lines.some((l) => !lineEmpty(l)) || !lineEmpty(sec.subtotal));

  rows.push({ kind: "group", label: "Revenues" });
  byRole(["revenue", "reimbursement"]).forEach((sec) => pushSection(sec));
  rows.push({ kind: "rollup", label: "Total Revenues", t: s.rollups.totalRevenues });
  rows.push({ kind: "group", label: "Operating Expenses" });
  byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]).forEach((sec) => pushSection(sec));
  rows.push({ kind: "rollup", label: "Total Operating Expenses", t: s.rollups.totalOperatingExpenses });
  rows.push({ kind: "rollup", label: "Net Operating Income", t: s.rollups.netOperatingIncome, strong: true });

  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  if (capitalSecs.length && hasActivity(capitalSecs)) {
    rows.push({ kind: "group", label: "Capital" });
    capitalSecs.forEach((sec) => pushSection(sec, false));
  }
  if (debtSecs.length && hasActivity(debtSecs)) {
    rows.push({ kind: "rollup", label: "Cash Flow Before Debt Service", t: s.rollups.cashFlowBeforeDebtService, strong: true });
    rows.push({ kind: "group", label: "Debt Service" });
    debtSecs.forEach((sec) => pushSection(sec));
    rows.push({ kind: "rollup", label: "Total Debt Service", t: s.rollups.totalDebtService });
    rows.push({ kind: "rollup", label: "Cash Flow After Debt Service", t: s.rollups.cashFlowAfterDebtService, strong: true });
  } else {
    rows.push({ kind: "rollup", label: "Cash Flow", t: s.rollups.cashFlowBeforeDebtService, strong: true });
  }
  return rows;
}

// ── Excel ────────────────────────────────────────────────────────────────────
const BRAND = "FF0B4A7D", BRAND_DARK = "FF0A3E69", BRAND_TINT = "FFE6EEF5", ROLLUP_FILL = "FFD9E4EE";

export async function buildStatementXlsx(s: PropertyStatement, meta: StatementMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KCP Portal";
  const ws = wb.addWorksheet("Operating Statement", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });
  const mon = MONTHS[meta.period - 1];
  const nCols = 8;
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= 8; c++) ws.getColumn(c).width = 13;

  ws.mergeCells(1, 1, 1, nCols);
  const title = ws.getCell(1, 1);
  title.value = `${meta.year} Operating Statement — ${meta.propertyCode} ${meta.propertyName}`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, nCols);
  const sub = ws.getCell(2, 1);
  sub.value = `Through ${mon} (period ${meta.period})${meta.budgetYear ? ` · Budget FY ${meta.budgetYear}` : ""}`;
  sub.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sub.alignment = { vertical: "middle", indent: 1 };

  const headers = ["Line", `${mon} Act`, `${mon} Bud`, `${mon} Var%`, "YTD Act", "YTD Bud", "YTD Var%", "Ann Bud"];
  const hdr = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle", indent: i === 0 ? 1 : 0 };
  });
  hdr.height = 18;

  const money = (cell: ExcelJS.Cell, v: number | null, bold: boolean, brand: boolean) => {
    cell.value = v == null ? null : v;
    cell.numFmt = MONEY_FMT;
    cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold, color: { argb: brand ? BRAND : "FF1A1A1A" } };
  };
  const pct = (cell: ExcelJS.Cell, v: number | null, b: number | null, bold: boolean) => {
    cell.value = varPct(v, b);
    cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold, color: { argb: v == null ? "FF9AA4B2" : v >= 0 ? "FF15803D" : "FFB91C1C" } };
  };

  for (const row of statementRows(s)) {
    if (row.kind === "group") {
      const gr = ws.addRow([row.label]);
      ws.mergeCells(gr.number, 1, gr.number, nCols);
      gr.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND } };
      gr.getCell(1).alignment = { indent: 1 };
      continue;
    }
    const isTotal = row.kind !== "line";
    const gr = ws.addRow([row.label]);
    gr.getCell(1).font = { bold: isTotal, size: 10, color: { argb: isTotal ? BRAND : "FF1A1A1A" } };
    gr.getCell(1).alignment = { indent: row.kind === "line" ? 2 : 1 };
    money(gr.getCell(2), row.t.periodActual, isTotal, isTotal);
    money(gr.getCell(3), row.t.periodBudget, isTotal, false);
    pct(gr.getCell(4), row.t.periodVariance, row.t.periodBudget, isTotal);
    money(gr.getCell(5), row.t.ytdActual, isTotal, isTotal);
    money(gr.getCell(6), row.t.ytdBudget, isTotal, false);
    pct(gr.getCell(7), row.t.ytdVariance, row.t.ytdBudget, isTotal);
    money(gr.getCell(8), row.t.annualBudget, isTotal, false);
    if (row.kind === "rollup") for (let c = 1; c <= nCols; c++) gr.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.strong ? ROLLUP_FILL : BRAND_TINT } };
  }
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

// ── PDF ──────────────────────────────────────────────────────────────────────
const PAGE_W = 792, PAGE_H = 612, MARGIN = 40;
const NAVY = rgb(0.043, 0.290, 0.490), NAVY_DARK = rgb(0.039, 0.243, 0.412);
const ROLLUP = rgb(0.851, 0.894, 0.933), GROUP_TINT = rgb(0.902, 0.933, 0.961);
const TEXT = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.4, 0.4, 0.4), RED = rgb(0.7, 0.13, 0.1), GREEN = rgb(0.08, 0.5, 0.24), WHITE = rgb(1, 1, 1);

// Line | P-Act P-Bud P-Var | YTD-Act YTD-Bud YTD-Var | Ann  (content 712)
const C = {
  line: { x: MARGIN, w: 176 },
  cols: [
    { x: MARGIN + 176, w: 80, kind: "money" }, { x: MARGIN + 256, w: 80, kind: "money" }, { x: MARGIN + 336, w: 56, kind: "pct" },
    { x: MARGIN + 392, w: 84, kind: "money" }, { x: MARGIN + 476, w: 84, kind: "money" }, { x: MARGIN + 560, w: 56, kind: "pct" },
    { x: MARGIN + 616, w: 80, kind: "money" },
  ] as { x: number; w: number; kind: "money" | "pct" }[],
};

function fmtMoney(v: number | null): { t: string; c: ReturnType<typeof rgb> } {
  if (v == null || Math.abs(v) < 0.5) return { t: "—", c: MUTED };
  const abs = Math.abs(Math.round(v)).toLocaleString("en-US");
  return v < 0 ? { t: `($${abs})`, c: RED } : { t: `$${abs}`, c: TEXT };
}

export async function buildStatementPdf(s: PropertyStatement, meta: StatementMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mon = MONTHS[meta.period - 1];
  const rows = statementRows(s);
  let page!: PDFPage, y = 0;
  const rightText = (str: string, xRight: number, yy: number, size: number, f: PDFFont, color = TEXT) => {
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: xRight - w, y: PAGE_H - yy, size, font: f, color });
  };
  const leftText = (str: string, x: number, yy: number, size: number, f: PDFFont, color = TEXT, maxW?: number) => {
    let t = str;
    if (maxW) while (t.length > 1 && f.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1);
    page.drawText(t, { x, y: PAGE_H - yy, size, font: f, color });
  };
  const headerLabels = [`${mon} Act`, `${mon} Bud`, `${mon} Var`, "YTD Act", "YTD Bud", "YTD Var", "Ann Bud"];
  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: NAVY_DARK });
    leftText(`${meta.year} Operating Statement — ${meta.propertyCode} ${meta.propertyName}`, MARGIN, 26, 14, bold, WHITE);
    rightText(`Through ${mon}${meta.budgetYear ? ` · Budget FY ${meta.budgetYear}` : ""}`, PAGE_W - MARGIN, 25, 9, font, WHITE);
    y = 54;
    page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 14), width: PAGE_W - MARGIN * 2, height: 16, color: NAVY });
    leftText("Line", C.line.x + 2, y + 11, 8, bold, WHITE);
    C.cols.forEach((col, i) => rightText(headerLabels[i], col.x + col.w - 3, y + 11, 7.5, bold, WHITE));
    y += 18;
  };
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(); };
  newPage();

  for (const row of rows) {
    if (y > PAGE_H - MARGIN - 14) newPage();
    if (row.kind === "group") {
      y += 4;
      page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 12), width: PAGE_W - MARGIN * 2, height: 14, color: GROUP_TINT });
      leftText(row.label.toUpperCase(), C.line.x + 2, y + 9.5, 8.5, bold, NAVY);
      y += 16;
      continue;
    }
    const isTotal = row.kind !== "line";
    const rowH = 14;
    if (row.kind === "rollup") page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 11), width: PAGE_W - MARGIN * 2, height: rowH, color: ROLLUP });
    const f = isTotal ? bold : font;
    leftText(row.label, C.line.x + (isTotal ? 2 : 6), y + 9.5, isTotal ? 8 : 7.5, f, isTotal ? NAVY : TEXT, C.line.w - 6);
    const vals: (number | null)[] = [row.t.periodActual, row.t.periodBudget, row.t.periodVariance, row.t.ytdActual, row.t.ytdBudget, row.t.ytdVariance, row.t.annualBudget];
    const budgets: (number | null)[] = [null, null, row.t.periodBudget, null, null, row.t.ytdBudget, null];
    C.cols.forEach((col, i) => {
      if (col.kind === "pct") {
        const txt = varPct(vals[i], budgets[i]);
        rightText(txt || "—", col.x + col.w - 3, y + 9.5, 7.5, f, vals[i] == null ? MUTED : (vals[i] as number) >= 0 ? GREEN : RED);
      } else {
        const m = fmtMoney(vals[i]);
        rightText(m.t, col.x + col.w - 3, y + 9.5, 7.5, f, isTotal ? NAVY : m.c);
      }
    });
    y += rowH;
  }
  return doc.save();
}
