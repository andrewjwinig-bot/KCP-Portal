// Excel + PDF exports for a property's Operating Statement — the Comparative
// Income Statement (Current Period + YTD Actual/Budget/Variance + Annual
// Budget). Excel via ExcelJS, PDF via pdf-lib. Carries the Korman wordmark,
// vertical dividers between the Period / YTD / Annual column groups, the
// per-line notes as numbered footnotes, and a "report run" timestamp.

import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { PropertyStatement, StatementSection, StatementTotals } from "./types";
import { fullYearRows, type FullYearPayload } from "./fullYear";
import { drawKormanLogo, KORMAN_TEXT } from "@/lib/financials/exportBrand";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONEY_FMT = '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)';

export type StatementMeta = { propertyCode: string; propertyName: string; year: number; period: number; budgetYear: number | null };
export type FullYearMeta = { propertyCode: string; propertyName: string; year: number; label: string };
type Notes = Record<string, string>;

type Row =
  | { kind: "group"; label: string }
  | { kind: "line" | "subtotal" | "rollup"; label: string; t: StatementTotals; strong?: boolean; noteKey?: string };

const isZero = (v: number | null) => v == null || Math.abs(v) < 0.5;
const lineEmpty = (t: StatementTotals) => isZero(t.ytdActual) && isZero(t.ytdBudget) && isZero(t.periodActual);
function varPct(v: number | null, b: number | null): string {
  if (v == null || b == null || Math.abs(b) < 0.5) return "";
  const p = (v / Math.abs(b)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}
function reportStamp(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export function statementRows(s: PropertyStatement): Row[] {
  const rows: Row[] = [];
  const byRole = (roles: string[]) => s.sections.filter((x) => roles.includes(x.role));
  const pushSection = (sec: StatementSection, withSubtotal = true) => {
    for (const l of sec.lines) if (!lineEmpty(l)) rows.push({ kind: "line", label: l.label, t: l, noteKey: `${sec.name}::${l.label}` });
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

/** Numbered footnotes for line rows that carry a note. */
function collectFootnotes(rows: Row[], notes: Notes): { byKey: Map<string, number>; list: { n: number; label: string; note: string }[] } {
  const byKey = new Map<string, number>();
  const list: { n: number; label: string; note: string }[] = [];
  for (const r of rows) {
    if (r.kind === "line" && r.noteKey && notes[r.noteKey]?.trim()) {
      const n = list.length + 1;
      byKey.set(r.noteKey, n);
      list.push({ n, label: r.label, note: notes[r.noteKey].trim() });
    }
  }
  return { byKey, list };
}

// ── Excel ────────────────────────────────────────────────────────────────────
const BRAND = "FF0B4A7D", BRAND_DARK = "FF0A3E69", BRAND_TINT = "FFE6EEF5", ROLLUP_FILL = "FFD9E4EE", BORDER = "FFB7C2CC";

export async function buildStatementXlsx(s: PropertyStatement, meta: StatementMeta, notes: Notes = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KCP Portal";
  const ws = wb.addWorksheet("Operating Statement", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  const mon = MONTHS[meta.period - 1];
  const nCols = 8;
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= 8; c++) ws.getColumn(c).width = 13;
  const rows = statementRows(s);
  const { byKey, list } = collectFootnotes(rows, notes);

  // Row 1 — Korman wordmark band.
  ws.mergeCells(1, 1, 1, nCols);
  const brand = ws.getCell(1, 1);
  brand.value = KORMAN_TEXT;
  brand.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  brand.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  brand.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(1).height = 20;
  // Row 2 — title.
  ws.mergeCells(2, 1, 2, nCols);
  const title = ws.getCell(2, 1);
  title.value = `${mon} ${meta.year} Operating Statement`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 24;
  // Row 3 — subtitle.
  ws.mergeCells(3, 1, 3, nCols);
  const sub = ws.getCell(3, 1);
  sub.value = `${meta.propertyCode} ${meta.propertyName}`;
  sub.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sub.alignment = { vertical: "middle", indent: 1 };

  const boundaryCols = new Set([1, 4, 7]); // right edge of Line, Period, YTD groups
  const edge = (cell: ExcelJS.Cell, col: number) => { if (boundaryCols.has(col)) cell.border = { ...(cell.border ?? {}), right: { style: "thin", color: { argb: BORDER } } }; };

  const headers = ["Line", `${mon} Act`, `${mon} Bud`, `${mon} Var%`, "YTD Act", "YTD Bud", "YTD Var%", "Ann Bud"];
  const hdr = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle", indent: i === 0 ? 1 : 0 };
    edge(cell, i + 1);
  });
  hdr.height = 18;

  const money = (cell: ExcelJS.Cell, v: number | null, bold: boolean, brand2: boolean, col: number) => {
    cell.value = v == null ? null : v; cell.numFmt = MONEY_FMT; cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold, color: { argb: brand2 ? BRAND : "FF1A1A1A" } }; edge(cell, col);
  };
  const pct = (cell: ExcelJS.Cell, v: number | null, b: number | null, bold: boolean, col: number) => {
    cell.value = varPct(v, b); cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold, color: { argb: v == null ? "FF9AA4B2" : v >= 0 ? "FF15803D" : "FFB91C1C" } }; edge(cell, col);
  };

  for (const row of rows) {
    if (row.kind === "group") {
      const gr = ws.addRow([row.label]);
      ws.mergeCells(gr.number, 1, gr.number, nCols);
      gr.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND } };
      gr.getCell(1).alignment = { indent: 1 };
      continue;
    }
    const isTotal = row.kind !== "line";
    const fn = row.noteKey ? byKey.get(row.noteKey) : undefined;
    const gr = ws.addRow([fn ? `${row.label}  [${fn}]` : row.label]);
    gr.getCell(1).font = { bold: isTotal, size: 10, color: { argb: isTotal ? BRAND : "FF1A1A1A" } };
    gr.getCell(1).alignment = { indent: row.kind === "line" ? 2 : 1 };
    edge(gr.getCell(1), 1);
    money(gr.getCell(2), row.t.periodActual, isTotal, isTotal, 2);
    money(gr.getCell(3), row.t.periodBudget, isTotal, false, 3);
    pct(gr.getCell(4), row.t.periodVariance, row.t.periodBudget, isTotal, 4);
    money(gr.getCell(5), row.t.ytdActual, isTotal, isTotal, 5);
    money(gr.getCell(6), row.t.ytdBudget, isTotal, false, 6);
    pct(gr.getCell(7), row.t.ytdVariance, row.t.ytdBudget, isTotal, 7);
    money(gr.getCell(8), row.t.annualBudget, isTotal, false, 8);
    if (isTotal) for (let c = 1; c <= nCols; c++) {
      const cell = gr.getCell(c);
      cell.border = { ...(cell.border ?? {}), top: { style: "thin", color: { argb: BORDER } } }; // underline above totals
      if (row.kind === "rollup") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.strong ? ROLLUP_FILL : BRAND_TINT } };
      edge(cell, c);
    }
  }

  if (list.length) {
    ws.addRow([]);
    const nh = ws.addRow(["Notes"]);
    nh.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND } };
    for (const f of list) {
      const nr = ws.addRow([]);
      ws.mergeCells(nr.number, 1, nr.number, nCols);
      nr.getCell(1).value = { richText: [
        { font: { bold: true, size: 9.5, color: { argb: BRAND } }, text: `[${f.n}] ${f.label}: ` },
        { font: { size: 9.5 }, text: f.note },
      ] };
      nr.getCell(1).alignment = { wrapText: true, vertical: "top" };
    }
  }
  ws.addRow([]);
  const stamp = ws.addRow([`Report run ${reportStamp()}`]);
  stamp.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

// ── Full-Year Excel (12 monthly columns + a formula-driven Full-Year total) ───
// The whole sheet is live: each line's Full-Year cell is =SUM(Jan:Dec), each
// section subtotal is =SUM(its line rows) per month, so the totals recompute and
// tie to what's on screen.
const colLetter = (c: number) => { let s = ""; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

export async function buildFullYearXlsx(payload: FullYearPayload, meta: FullYearMeta, notes: Notes = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KCP Portal";
  const ws = wb.addWorksheet(meta.label, { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  const nCols = 14; // Line + 12 months + Full Year
  const FY_COL = 14, FIRST_M = 2, LAST_M = 13;
  ws.getColumn(1).width = 32;
  for (let c = FIRST_M; c <= LAST_M; c++) ws.getColumn(c).width = 11;
  ws.getColumn(FY_COL).width = 13.5;

  // Rows 1–3: brand band, title, subtitle.
  ws.mergeCells(1, 1, 1, nCols);
  const brand = ws.getCell(1, 1);
  brand.value = KORMAN_TEXT;
  brand.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  brand.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  brand.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(1).height = 20;
  ws.mergeCells(2, 1, 2, nCols);
  const title = ws.getCell(2, 1);
  title.value = `${meta.year} Operating Statement — ${meta.label}`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 24;
  ws.mergeCells(3, 1, 3, nCols);
  const sub = ws.getCell(3, 1);
  sub.value = `${meta.propertyCode} ${meta.propertyName}`;
  sub.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sub.alignment = { vertical: "middle", indent: 1 };

  // Row 4: header (Line, Jan…Dec, Full Year 'YY).
  const yy = String(meta.year).slice(2);
  const headers = ["Line", ...MONTHS, `Full Year ${yy}`];
  const hdr = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i === FY_COL - 1 ? BRAND_DARK : BRAND } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle", indent: i === 0 ? 1 : 0 };
    if (i === 0 || i === LAST_M) cell.border = { right: { style: "thin", color: { argb: BORDER } } };
  });
  hdr.height = 18;

  const rows = fullYearRows(payload);
  const money = (cell: ExcelJS.Cell, v: number | null, bold: boolean, brand2: boolean) => {
    cell.value = v == null ? null : v; cell.numFmt = MONEY_FMT; cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold, color: { argb: brand2 ? BRAND : "FF1A1A1A" } };
  };
  const formula = (cell: ExcelJS.Cell, f: string, bold: boolean, brand2: boolean) => {
    cell.value = { formula: f }; cell.numFmt = MONEY_FMT; cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold, color: { argb: brand2 ? BRAND : "FF1A1A1A" } };
  };

  // Track the contiguous line-row range of the current section so a subtotal
  // can SUM exactly its lines per month.
  let secStart = 0, secEnd = 0;
  const resetSection = () => { secStart = 0; secEnd = 0; };

  for (const row of rows) {
    if (row.kind === "group") {
      resetSection();
      const gr = ws.addRow([row.label]);
      ws.mergeCells(gr.number, 1, gr.number, nCols);
      gr.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND } };
      gr.getCell(1).alignment = { indent: 1 };
      continue;
    }
    const isTotal = row.kind !== "line";
    const gr = ws.addRow([row.label]);
    const rn = gr.number;
    gr.getCell(1).font = { bold: isTotal, size: 10, color: { argb: isTotal ? BRAND : "FF1A1A1A" } };
    gr.getCell(1).alignment = { indent: row.kind === "line" ? 2 : 1 };

    if (row.kind === "line") {
      if (!secStart) secStart = rn;
      secEnd = rn;
      for (let i = 0; i < 12; i++) money(gr.getCell(FIRST_M + i), row.monthly[i] ?? 0, false, false);
      formula(gr.getCell(FY_COL), `SUM(${colLetter(FIRST_M)}${rn}:${colLetter(LAST_M)}${rn})`, false, true);
    } else if (row.kind === "subtotal") {
      const brand2 = true;
      for (let i = 0; i < 12; i++) {
        const col = colLetter(FIRST_M + i);
        if (secStart) formula(gr.getCell(FIRST_M + i), `SUM(${col}${secStart}:${col}${secEnd})`, true, brand2);
        else money(gr.getCell(FIRST_M + i), row.monthly[i] ?? 0, true, brand2); // no lines shown → static
      }
      formula(gr.getCell(FY_COL), `SUM(${colLetter(FIRST_M)}${rn}:${colLetter(LAST_M)}${rn})`, true, brand2);
      resetSection();
    } else { // rollup
      for (let i = 0; i < 12; i++) money(gr.getCell(FIRST_M + i), row.monthly[i] ?? 0, true, true);
      formula(gr.getCell(FY_COL), `SUM(${colLetter(FIRST_M)}${rn}:${colLetter(LAST_M)}${rn})`, true, true);
    }

    if (isTotal) for (let c = 1; c <= nCols; c++) {
      const cell = gr.getCell(c);
      cell.border = { ...(cell.border ?? {}), top: { style: "thin", color: { argb: BORDER } } };
      if (row.kind === "rollup") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.strong ? ROLLUP_FILL : BRAND_TINT } };
    }
    // Vertical divider right of the Line column + right of December.
    gr.getCell(1).border = { ...(gr.getCell(1).border ?? {}), right: { style: "thin", color: { argb: BORDER } } };
    gr.getCell(LAST_M).border = { ...(gr.getCell(LAST_M).border ?? {}), right: { style: "thin", color: { argb: BORDER } } };
  }

  // Notes (label: text), if any.
  const noteList = Object.entries(notes).filter(([, v]) => v?.trim());
  if (noteList.length) {
    ws.addRow([]);
    const nh = ws.addRow(["Notes"]);
    nh.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND } };
    for (const [key, note] of noteList) {
      const label = key.includes("::") ? key.split("::").pop()! : key;
      const nr = ws.addRow([]);
      ws.mergeCells(nr.number, 1, nr.number, nCols);
      nr.getCell(1).value = { richText: [
        { font: { bold: true, size: 9.5, color: { argb: BRAND } }, text: `${label}: ` },
        { font: { size: 9.5 }, text: note.trim() },
      ] };
      nr.getCell(1).alignment = { wrapText: true, vertical: "top" };
    }
  }
  ws.addRow([]);
  const stamp = ws.addRow([`Report run ${reportStamp()}`]);
  stamp.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

// ── PDF ──────────────────────────────────────────────────────────────────────
const PAGE_W = 792, PAGE_H = 612, MARGIN = 40;
const NAVY = rgb(0.043, 0.290, 0.490), NAVY_DARK = rgb(0.039, 0.243, 0.412);
const ROLLUP = rgb(0.851, 0.894, 0.933), GROUP_TINT = rgb(0.902, 0.933, 0.961);
const TEXT = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.4, 0.4, 0.4), RED = rgb(0.7, 0.13, 0.1), GREEN = rgb(0.08, 0.5, 0.24), WHITE = rgb(1, 1, 1);
const RULE = rgb(0.78, 0.82, 0.86);

const C = {
  line: { x: MARGIN, w: 176 },
  cols: [
    { x: MARGIN + 176, w: 80, kind: "money" }, { x: MARGIN + 256, w: 80, kind: "money" }, { x: MARGIN + 336, w: 56, kind: "pct" },
    { x: MARGIN + 392, w: 84, kind: "money" }, { x: MARGIN + 476, w: 84, kind: "money" }, { x: MARGIN + 560, w: 56, kind: "pct" },
    { x: MARGIN + 616, w: 80, kind: "money" },
  ] as { x: number; w: number; kind: "money" | "pct" }[],
};
const GROUP_DIVIDERS = [MARGIN + 176, MARGIN + 392, MARGIN + 616]; // Line | Period | YTD edges

function fmtMoney(v: number | null): { t: string; c: ReturnType<typeof rgb> } {
  if (v == null || Math.abs(v) < 0.5) return { t: "—", c: MUTED };
  const abs = Math.abs(Math.round(v)).toLocaleString("en-US");
  return v < 0 ? { t: `($${abs})`, c: RED } : { t: `$${abs}`, c: TEXT };
}

export async function buildStatementPdf(s: PropertyStatement, meta: StatementMeta, notes: Notes = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mon = MONTHS[meta.period - 1];
  const rows = statementRows(s);
  const { byKey, list } = collectFootnotes(rows, notes);
  let page!: PDFPage, y = 0, tableTop = 0, pageHasColumns = false;
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
  const flushDividers = () => {
    if (!pageHasColumns) return;
    for (const x of GROUP_DIVIDERS) page.drawLine({ start: { x, y: PAGE_H - tableTop }, end: { x, y: PAGE_H - y }, thickness: 0.6, color: RULE });
  };
  const drawHeader = (withColumns: boolean) => {
    page.drawRectangle({ x: 0, y: PAGE_H - 44, width: PAGE_W, height: 44, color: NAVY_DARK });
    leftText(`${mon} ${meta.year} Operating Statement`, MARGIN, 20, 13, bold, WHITE);
    leftText(`${meta.propertyCode} ${meta.propertyName}`, MARGIN, 35, 9, font, rgb(0.85, 0.9, 0.95));
    drawKormanLogo(page, bold, font, { xRight: PAGE_W - MARGIN, centerTop: 22, color: WHITE, scale: 0.92 });
    if (withColumns) {
      y = 58;
      page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 14), width: PAGE_W - MARGIN * 2, height: 16, color: NAVY });
      leftText("Line", C.line.x + 2, y + 11, 8, bold, WHITE);
      C.cols.forEach((col, i) => rightText(headerLabels[i], col.x + col.w - 3, y + 11, 7.5, bold, WHITE));
      y += 18;
      tableTop = y - 2;
      pageHasColumns = true;
    } else {
      y = 56;
      pageHasColumns = false;
    }
  };
  const newPage = (withColumns = true) => { if (page) flushDividers(); page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(withColumns); };
  newPage();

  for (const row of rows) {
    if (y > PAGE_H - MARGIN - 16) newPage();
    if (row.kind === "group") {
      y += 4;
      page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 12), width: PAGE_W - MARGIN * 2, height: 14, color: GROUP_TINT });
      leftText(row.label.toUpperCase(), C.line.x + 2, y + 9.5, 8.5, bold, NAVY);
      y += 16;
      continue;
    }
    const isTotal = row.kind !== "line";
    const rowH = 14;
    // Underline above every totals row, separating it from the line items.
    if (isTotal) page.drawLine({ start: { x: MARGIN, y: PAGE_H - (y - 1) }, end: { x: PAGE_W - MARGIN, y: PAGE_H - (y - 1) }, thickness: 0.8, color: rgb(0.55, 0.6, 0.66) });
    if (row.kind === "rollup") page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 11), width: PAGE_W - MARGIN * 2, height: rowH, color: ROLLUP });
    const f = isTotal ? bold : font;
    const fn = row.noteKey ? byKey.get(row.noteKey) : undefined;
    leftText(row.label + (fn ? ` [${fn}]` : ""), C.line.x + (isTotal ? 2 : 6), y + 9.5, isTotal ? 8 : 7.5, f, isTotal ? NAVY : TEXT, C.line.w - 6);
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
  flushDividers();

  // Footnotes — on their own page (no table column header), with the line name
  // bolded to break up the text.
  if (list.length) {
    newPage(false);
    leftText("NOTES", MARGIN, y + 9, 11, bold, NAVY);
    y += 20;
    const maxW = PAGE_W - MARGIN * 2;
    for (const f of list) {
      const prefix = `[${f.n}] ${f.label}: `;
      const prefixW = bold.widthOfTextAtSize(prefix, 8);
      const segs: { text: string; indent: number }[] = [];
      let cur = "", avail = maxW - prefixW, first = true;
      for (const w of f.note.split(" ")) {
        const test = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(test, 8) > avail) { segs.push({ text: cur, indent: first ? prefixW : 0 }); cur = w; first = false; avail = maxW; }
        else cur = test;
      }
      segs.push({ text: cur, indent: first ? prefixW : 0 });
      if (y > PAGE_H - MARGIN - 14) newPage(false);
      leftText(prefix, MARGIN, y + 8, 8, bold, NAVY); // bold the line name
      for (const seg of segs) {
        if (y > PAGE_H - MARGIN - 14) newPage(false);
        leftText(seg.text, MARGIN + seg.indent, y + 8, 8, font, TEXT);
        y += 11;
      }
      y += 3;
    }
  }

  // Timestamp footer at the bottom of the last page.
  leftText(`Report run ${reportStamp()}`, MARGIN, PAGE_H - MARGIN + 14, 8, font, MUTED);

  return doc.save();
}

// ── Full-Year PDF (landscape 12-month grid + Full-Year total) ──────────────────
export async function buildFullYearPdf(payload: FullYearPayload, meta: FullYearMeta, notes: Notes = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const rows = fullYearRows(payload);

  const lineX = MARGIN, lineW = 122;
  const monthsX = MARGIN + lineW;
  const monthW = 42;
  const fyX = monthsX + 12 * monthW;
  const fyW = PAGE_W - MARGIN - fyX;
  const yy = String(meta.year).slice(2);

  let page!: PDFPage, y = 0, tableTop = 0;
  const rightText = (str: string, xRight: number, yy2: number, size: number, f: PDFFont, color = TEXT) => {
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: xRight - w, y: PAGE_H - yy2, size, font: f, color });
  };
  const leftText = (str: string, x: number, yy2: number, size: number, f: PDFFont, color = TEXT, maxW?: number) => {
    let t = str;
    if (maxW) while (t.length > 1 && f.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1);
    page.drawText(t, { x, y: PAGE_H - yy2, size, font: f, color });
  };
  const colX = (i: number) => monthsX + i * monthW; // left edge of month i
  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: PAGE_H - 44, width: PAGE_W, height: 44, color: NAVY_DARK });
    leftText(`${meta.year} Operating Statement — ${meta.label}`, MARGIN, 20, 13, bold, WHITE);
    leftText(`${meta.propertyCode} ${meta.propertyName}`, MARGIN, 35, 9, font, rgb(0.85, 0.9, 0.95));
    drawKormanLogo(page, bold, font, { xRight: PAGE_W - MARGIN, centerTop: 22, color: WHITE, scale: 0.92 });
    y = 56;
    page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 13), width: PAGE_W - MARGIN * 2, height: 15, color: NAVY });
    leftText("Line", lineX + 2, y + 10, 7, bold, WHITE);
    MONTHS.forEach((m, i) => rightText(m, colX(i) + monthW - 2, y + 10, 6.5, bold, WHITE));
    rightText(`FY ${yy}`, fyX + fyW - 2, y + 10, 7, bold, WHITE);
    y += 17;
    tableTop = y - 2;
  };
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(); };
  newPage();

  const money6 = (v: number | null) => fmtMoney(v);
  for (const row of rows) {
    if (y > PAGE_H - MARGIN - 14) newPage();
    if (row.kind === "group") {
      y += 3;
      page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 11), width: PAGE_W - MARGIN * 2, height: 13, color: GROUP_TINT });
      leftText(row.label.toUpperCase(), lineX + 2, y + 8.5, 8, bold, NAVY);
      y += 15;
      continue;
    }
    const isTotal = row.kind !== "line";
    const rowH = 12.5;
    if (isTotal) page.drawLine({ start: { x: MARGIN, y: PAGE_H - (y - 1) }, end: { x: PAGE_W - MARGIN, y: PAGE_H - (y - 1) }, thickness: 0.7, color: rgb(0.55, 0.6, 0.66) });
    if (row.kind === "rollup") page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 10), width: PAGE_W - MARGIN * 2, height: rowH, color: ROLLUP });
    const f = isTotal ? bold : font;
    leftText(row.label, lineX + (isTotal ? 2 : 5), y + 8.5, isTotal ? 7 : 6.8, f, isTotal ? NAVY : TEXT, lineW - 6);
    for (let i = 0; i < 12; i++) {
      const m = money6(row.monthly[i] ?? 0);
      rightText(m.t, colX(i) + monthW - 2, y + 8.5, 6.3, f, isTotal ? NAVY : m.c);
    }
    const tot = money6(row.total);
    rightText(tot.t, fyX + fyW - 2, y + 8.5, 6.6, bold, NAVY);
    y += rowH;
  }
  // Divider right of the Line column, full table height.
  page.drawLine({ start: { x: monthsX, y: PAGE_H - tableTop }, end: { x: monthsX, y: PAGE_H - y }, thickness: 0.6, color: RULE });
  page.drawLine({ start: { x: fyX, y: PAGE_H - tableTop }, end: { x: fyX, y: PAGE_H - y }, thickness: 0.6, color: RULE });

  const noteList = Object.entries(notes).filter(([, v]) => v?.trim());
  if (noteList.length) {
    y += 12;
    if (y > PAGE_H - MARGIN - 30) { page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(); }
    leftText("NOTES", MARGIN, y + 8, 9, bold, NAVY); y += 15;
    for (const [key, note] of noteList) {
      if (y > PAGE_H - MARGIN - 14) { page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(); }
      const label = key.includes("::") ? key.split("::").pop()! : key;
      leftText(`${label}: ${note.trim()}`, MARGIN, y + 8, 7.5, font, TEXT, PAGE_W - MARGIN * 2);
      y += 11;
    }
  }
  leftText(`Report run ${reportStamp()}`, MARGIN, PAGE_H - MARGIN + 14, 8, font, MUTED);
  return doc.save();
}
