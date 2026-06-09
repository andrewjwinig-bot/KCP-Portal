// Excel + PDF exports for a property's full-year Reprojection (the blended
// actual+budget forecast). Excel via ExcelJS, PDF via pdf-lib — same brand
// navy as the Budgets exports. Both consume one ordered row list so the file
// reads exactly like the page (group headers → section lines → subtotals →
// rollups), with actual months tinted green.

import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { Reprojection, ReprojSection, ReprojTotals } from "./compute";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONEY_FMT = '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)';

export type ReprojMeta = { propertyCode: string; propertyName: string; year: number; budgetYear: number | null };

type Row =
  | { kind: "group"; label: string }
  | { kind: "line" | "subtotal" | "rollup"; label: string; t: ReprojTotals; strong?: boolean };

const isZero = (v: number) => Math.abs(v) < 0.5;
const lineEmpty = (t: ReprojTotals) => isZero(t.reprojTotal) && isZero(t.budgetTotal);

/** Ordered rows mirroring the page layout (empty lines skipped). */
export function reprojRows(r: Reprojection): Row[] {
  const rows: Row[] = [];
  const byRole = (roles: string[]) => r.sections.filter((s) => roles.includes(s.role));
  const pushSection = (s: ReprojSection, withSubtotal = true) => {
    for (const l of s.lines) if (!lineEmpty(l)) rows.push({ kind: "line", label: l.label, t: l });
    if (withSubtotal) rows.push({ kind: "subtotal", label: s.role === "revenue" ? "Total Revenue and Other" : `Total ${s.name}`, t: s.subtotal });
  };
  const hasActivity = (secs: ReprojSection[]) => secs.some((s) => s.lines.some((l) => !lineEmpty(l)) || !lineEmpty(s.subtotal));

  rows.push({ kind: "group", label: "Revenues" });
  byRole(["revenue", "reimbursement"]).forEach((s) => pushSection(s));
  rows.push({ kind: "rollup", label: "Total Revenues", t: r.rollups.totalRevenues });

  rows.push({ kind: "group", label: "Operating Expenses" });
  byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]).forEach((s) => pushSection(s));
  rows.push({ kind: "rollup", label: "Total Operating Expenses", t: r.rollups.totalOperatingExpenses });
  rows.push({ kind: "rollup", label: "Net Operating Income", t: r.rollups.netOperatingIncome, strong: true });

  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  if (capitalSecs.length && hasActivity(capitalSecs)) {
    rows.push({ kind: "group", label: "Capital Improvements" });
    capitalSecs.forEach((s) => pushSection(s, false));
  }
  if (debtSecs.length && hasActivity(debtSecs)) {
    rows.push({ kind: "rollup", label: "Cash Flow Before Debt Service", t: r.rollups.cashFlowBeforeDebtService, strong: true });
    rows.push({ kind: "group", label: "Debt Service" });
    debtSecs.forEach((s) => pushSection(s));
    rows.push({ kind: "rollup", label: "Total Debt Service", t: r.rollups.totalDebtService });
    rows.push({ kind: "rollup", label: "Cash Flow After Debt Service", t: r.rollups.cashFlowAfterDebtService, strong: true });
  } else {
    rows.push({ kind: "rollup", label: "Cash Flow", t: r.rollups.cashFlowBeforeDebtService, strong: true });
  }
  return rows;
}

// ── Excel ────────────────────────────────────────────────────────────────────
const BRAND = "FF0B4A7D";
const BRAND_DARK = "FF0A3E69";
const BRAND_TINT = "FFE6EEF5";
const ROLLUP_FILL = "FFD9E4EE";
const ACTUAL_FILL = "FFE7F2EA"; // light green for actual months

export async function buildReprojXlsx(r: Reprojection, meta: ReprojMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KCP Portal";
  const ws = wb.addWorksheet("Reprojection", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });
  const through = r.actualThroughMonth;
  const nCols = 1 + 12 + 3; // line + months + full/bud/var

  ws.getColumn(1).width = 30;
  for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 11;
  ws.getColumn(14).width = 13; ws.getColumn(15).width = 12; ws.getColumn(16).width = 11;

  // Title band.
  ws.mergeCells(1, 1, 1, nCols);
  const title = ws.getCell(1, 1);
  title.value = `${meta.year} Reprojection — ${meta.propertyCode} ${meta.propertyName}`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, nCols);
  const sub = ws.getCell(2, 1);
  sub.value = `Actuals Jan–${through > 0 ? MONTHS[through - 1] : "(none)"} · budget thereafter${meta.budgetYear ? ` · Budget FY ${meta.budgetYear}` : ""}`;
  sub.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sub.alignment = { vertical: "middle", indent: 1 };

  // Header row.
  const hdr = ws.getRow(3);
  const headers = ["Line", ...MONTHS, "Full Year", "Ann Bud", "Var"];
  headers.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle", indent: i === 0 ? 1 : 0 };
  });
  hdr.height = 18;

  const moneyCell = (cell: ExcelJS.Cell, v: number | null, opts: { bold?: boolean; actual?: boolean; brand?: boolean } = {}) => {
    cell.value = v == null ? null : v;
    cell.numFmt = MONEY_FMT;
    cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold: !!opts.bold, color: { argb: opts.brand ? BRAND : "FF1A1A1A" } };
    if (opts.actual) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACTUAL_FILL } };
  };

  for (const row of reprojRows(r)) {
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
    for (let i = 0; i < 12; i++) moneyCell(gr.getCell(2 + i), row.t.blended[i], { bold: isTotal, actual: i < through, brand: isTotal });
    moneyCell(gr.getCell(14), row.t.reprojTotal, { bold: true, brand: true });
    moneyCell(gr.getCell(15), row.t.budgetTotal, { bold: isTotal });
    moneyCell(gr.getCell(16), row.t.variance, { bold: isTotal });
    if (row.kind === "rollup") {
      for (let c = 1; c <= nCols; c++) gr.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.strong ? ROLLUP_FILL : BRAND_TINT } };
    }
  }

  if (r.unbudgetedAccounts.length) {
    ws.addRow([]);
    const u = ws.addRow(["Unbudgeted Actuals (not in any line)"]);
    u.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
    for (const acct of r.unbudgetedAccounts) {
      const ur = ws.addRow([acct.account]);
      ur.getCell(1).alignment = { indent: 2 };
      moneyCell(ur.getCell(14), acct.actualTotal);
    }
  }

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

// ── PDF ──────────────────────────────────────────────────────────────────────
const PAGE_W = 792, PAGE_H = 612, MARGIN = 30;
const NAVY = rgb(0.043, 0.290, 0.490);
const NAVY_DARK = rgb(0.039, 0.243, 0.412);
const ROLLUP = rgb(0.851, 0.894, 0.933);
const GROUP_TINT = rgb(0.902, 0.933, 0.961);
const ACTUAL = rgb(0.906, 0.949, 0.918);
const TEXT = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.4, 0.4, 0.4), RED = rgb(0.7, 0.13, 0.1), WHITE = rgb(1, 1, 1);

const LINE_X = MARGIN, LINE_W = 112;
const MON_X = MARGIN + LINE_W, MON_W = 39; // 12 × 39 = 468
const FULL_X = MON_X + MON_W * 12, FULL_W = 52;
const BUD_X = FULL_X + FULL_W, BUD_W = 42;
const VAR_X = BUD_X + BUD_W, VAR_W = 38; // ends at 762 = 792-30

function fmtMoney(v: number | null): { t: string; c: ReturnType<typeof rgb> } {
  if (v == null || Math.abs(v) < 0.5) return { t: "—", c: MUTED };
  const abs = Math.abs(Math.round(v)).toLocaleString("en-US");
  return v < 0 ? { t: `($${abs})`, c: RED } : { t: `$${abs}`, c: TEXT };
}

export async function buildReprojPdf(r: Reprojection, meta: ReprojMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const through = r.actualThroughMonth;
  const rows = reprojRows(r);

  let page!: PDFPage;
  let y = 0;
  const rightText = (s: string, xRight: number, yy: number, size: number, f: PDFFont, color = TEXT) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: PAGE_H - yy, size, font: f, color });
  };
  const leftText = (s: string, x: number, yy: number, size: number, f: PDFFont, color = TEXT, maxW?: number) => {
    let str = s;
    if (maxW) while (str.length > 1 && f.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -1);
    page.drawText(str, { x, y: PAGE_H - yy, size, font: f, color });
  };

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: NAVY_DARK });
    leftText(`${meta.year} Reprojection — ${meta.propertyCode} ${meta.propertyName}`, MARGIN, 26, 14, bold, WHITE);
    rightText(`Actuals Jan–${through > 0 ? MONTHS[through - 1] : "(none)"}${meta.budgetYear ? ` · Budget FY ${meta.budgetYear}` : ""}`, PAGE_W - MARGIN, 25, 9, font, WHITE);
    // Column header band.
    y = 54;
    page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 14), width: PAGE_W - MARGIN * 2, height: 16, color: NAVY });
    leftText("Line", LINE_X + 2, y + 11, 7.5, bold, WHITE);
    MONTHS.forEach((m, i) => rightText(m, MON_X + MON_W * (i + 1) - 2, y + 11, 7, bold, WHITE));
    rightText("Full Yr", FULL_X + FULL_W - 2, y + 11, 7.5, bold, WHITE);
    rightText("Ann Bud", BUD_X + BUD_W - 2, y + 11, 7, bold, WHITE);
    rightText("Var", VAR_X + VAR_W - 2, y + 11, 7.5, bold, WHITE);
    y += 18;
  };
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(); };
  newPage();

  for (const row of rows) {
    if (y > PAGE_H - MARGIN - 14) newPage();
    if (row.kind === "group") {
      y += 4;
      page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 12), width: PAGE_W - MARGIN * 2, height: 14, color: GROUP_TINT });
      leftText(row.label.toUpperCase(), LINE_X + 2, y + 9.5, 8, bold, NAVY);
      y += 16;
      continue;
    }
    const isTotal = row.kind !== "line";
    const rowH = 13;
    if (row.kind === "rollup") page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 11), width: PAGE_W - MARGIN * 2, height: rowH, color: ROLLUP });
    // Actual-month tint behind elapsed months (lines only, subtle).
    if (!isTotal && through > 0) page.drawRectangle({ x: MON_X, y: PAGE_H - (y + 11), width: MON_W * through, height: rowH, color: ACTUAL });
    const f = isTotal ? bold : font;
    leftText(row.label, LINE_X + (isTotal ? 2 : 6), y + 9, isTotal ? 7.5 : 7, f, isTotal ? NAVY : TEXT, LINE_W - 6);
    for (let i = 0; i < 12; i++) {
      const m = fmtMoney(row.t.blended[i]);
      rightText(m.t, MON_X + MON_W * (i + 1) - 2, y + 9, 6.5, f, isTotal ? NAVY : m.c);
    }
    const full = fmtMoney(row.t.reprojTotal); rightText(full.t, FULL_X + FULL_W - 2, y + 9, 7, bold, NAVY);
    const bud = fmtMoney(row.t.budgetTotal); rightText(bud.t, BUD_X + BUD_W - 2, y + 9, 6.5, f, isTotal ? NAVY : MUTED);
    const vv = row.t.variance;
    const varColor = vv == null ? MUTED : vv >= 0 ? rgb(0.08, 0.5, 0.24) : RED;
    rightText(vv == null ? "—" : fmtMoney(vv).t, VAR_X + VAR_W - 2, y + 9, 6.5, f, varColor);
    y += rowH;
  }

  return doc.save();
}
