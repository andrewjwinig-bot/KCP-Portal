// Excel + PDF exports for a property's full-year Reprojection (the blended
// actual+budget forecast). Excel via ExcelJS, PDF via pdf-lib. Carries the
// Korman wordmark, actual-month green tint, quarter/section vertical dividers,
// per-line notes as numbered footnotes, and a "report run" timestamp.

import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { Reprojection, ReprojSection, ReprojTotals } from "./compute";
import { drawKormanLogo, KORMAN_TEXT } from "@/lib/financials/exportBrand";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONEY_FMT = '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)';

export type ReprojMeta = { propertyCode: string; propertyName: string; year: number; budgetYear: number | null };
type Notes = Record<string, string>;

type Row =
  | { kind: "group"; label: string }
  | { kind: "line" | "subtotal" | "rollup"; label: string; t: ReprojTotals; strong?: boolean; noteKey?: string };

const isZero = (v: number) => Math.abs(v) < 0.5;
const lineEmpty = (t: ReprojTotals) => isZero(t.reprojTotal) && isZero(t.budgetTotal);
function reportStamp(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export function reprojRows(r: Reprojection): Row[] {
  const rows: Row[] = [];
  const byRole = (roles: string[]) => r.sections.filter((s) => roles.includes(s.role));
  const pushSection = (s: ReprojSection, withSubtotal = true) => {
    for (const l of s.lines) if (!lineEmpty(l)) rows.push({ kind: "line", label: l.label, t: l, noteKey: `${s.name}::${l.label}` });
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

function collectFootnotes(rows: Row[], notes: Notes) {
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
const BRAND = "FF0B4A7D", BRAND_DARK = "FF0A3E69", BRAND_TINT = "FFE6EEF5", ROLLUP_FILL = "FFD9E4EE", ACTUAL_FILL = "FFE7F2EA", BORDER = "FFB7C2CC";
const colLetter = (c: number) => { let s = ""; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

export async function buildReprojXlsx(r: Reprojection, meta: ReprojMeta, notes: Notes = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KCP Portal";
  const ws = wb.addWorksheet("Reprojection", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  const through = r.actualThroughMonth;
  const nCols = 16;
  const rows = reprojRows(r);
  const { byKey, list } = collectFootnotes(rows, notes);

  ws.getColumn(1).width = 30;
  for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 11;
  ws.getColumn(14).width = 13; ws.getColumn(15).width = 12; ws.getColumn(16).width = 11;

  ws.mergeCells(1, 1, 1, nCols);
  const brand = ws.getCell(1, 1);
  brand.value = KORMAN_TEXT;
  brand.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  brand.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  brand.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(1).height = 20;
  ws.mergeCells(2, 1, 2, nCols);
  const title = ws.getCell(2, 1);
  title.value = `${meta.year} Reprojection — ${meta.propertyCode} ${meta.propertyName}`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 24;
  ws.mergeCells(3, 1, 3, nCols);
  const sub = ws.getCell(3, 1);
  sub.value = `Actuals Jan–${through > 0 ? MONTHS[through - 1] : "(none)"} · budget thereafter${meta.budgetYear ? ` · Budget FY ${meta.budgetYear}` : ""}`;
  sub.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sub.alignment = { vertical: "middle", indent: 1 };

  const boundaryCols = new Set([1, 4, 7, 10, 13]); // line, quarter ends, before Full Year
  const edge = (cell: ExcelJS.Cell, col: number) => { if (boundaryCols.has(col)) cell.border = { ...(cell.border ?? {}), right: { style: "thin", color: { argb: BORDER } } }; };

  const hdr = ws.getRow(4);
  ["Line", ...MONTHS, "Full Year", "Ann Bud", "Var"].forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle", indent: i === 0 ? 1 : 0 };
    edge(cell, i + 1);
  });
  hdr.height = 18;

  const money = (cell: ExcelJS.Cell, v: number | null, opts: { bold?: boolean; actual?: boolean; brand2?: boolean; col: number; formula?: { f: string; result: number } }) => {
    cell.value = opts.formula ? { formula: opts.formula.f, result: opts.formula.result } : v == null ? null : v;
    cell.numFmt = MONEY_FMT; cell.alignment = { horizontal: "right" };
    cell.font = { size: 10, bold: !!opts.bold, color: { argb: opts.brand2 ? BRAND : "FF1A1A1A" } };
    if (opts.actual) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACTUAL_FILL } };
    edge(cell, opts.col);
  };

  // Live-formula plumbing (see statementExport for the same approach): the Full
  // Year column is =SUM(Jan:Dec) on every row; Variance is Full Year − Ann Bud
  // (sign per each line's favorability); and each total's months + Ann Bud SUM
  // the exact source rows above it. Formulas cache their result and fall back to
  // a static number if the referenced rows don't reconcile to the known total.
  type Grp = { sign: 1 | -1; rows: number[] };
  const rowT = new Map<number, ReprojTotals>();
  const valBlended = (rn: number, i: number) => { const v = rowT.get(rn)?.blended[i]; return typeof v === "number" ? v : 0; };
  const valBudget = (rn: number) => { const v = rowT.get(rn)?.budgetTotal; return typeof v === "number" ? v : 0; };
  const buildSum = (groups: Grp[], L: string, get: (rn: number) => number): { formula: string; val: number } => {
    let val = 0; const parts: string[] = [];
    for (const g of groups) {
      const rs = g.rows.filter((r) => r > 0);
      if (!rs.length) continue;
      let s = 0; for (const r of rs) s += get(r);
      val += g.sign * s;
      const contiguous = rs.every((r, i) => i === 0 || r === rs[i - 1] + 1);
      const expr = rs.length === 1 ? `${L}${rs[0]}`
        : contiguous ? `SUM(${L}${rs[0]}:${L}${rs[rs.length - 1]})`
        : `SUM(${rs.map((r) => `${L}${r}`).join(",")})`;
      parts.push((parts.length === 0 ? (g.sign < 0 ? "-" : "") : g.sign < 0 ? "-" : "+") + expr);
    }
    return { formula: parts.join(""), val };
  };
  const colSum = (groups: Grp[], col: number, get: (rn: number) => number, expected: number | null) => {
    if (expected == null) return undefined;
    const { formula, val } = buildSum(groups, colLetter(col), get);
    return formula && Math.abs(val - expected) < 0.5 ? { f: formula, result: expected } : undefined;
  };
  const fyFormula = (rn: number, t: ReprojTotals) => {
    let s = 0; for (let i = 0; i < 12; i++) if (typeof t.blended[i] === "number") s += t.blended[i];
    return Math.abs(s - t.reprojTotal) < 0.5 ? { f: `SUM(${colLetter(2)}${rn}:${colLetter(13)}${rn})`, result: t.reprojTotal } : undefined;
  };
  const varFormula = (rn: number, t: ReprojTotals) => {
    if (t.variance == null) return undefined;
    const N = `${colLetter(14)}${rn}`, O = `${colLetter(15)}${rn}`, d = t.reprojTotal - t.budgetTotal;
    if (Math.abs(d - t.variance) < 0.5) return { f: `${N}-${O}`, result: t.variance };
    if (Math.abs(-d - t.variance) < 0.5) return { f: `${O}-${N}`, result: t.variance };
    return undefined;
  };

  const secLines: number[] = [];
  const revSub: number[] = [], opexSub: number[] = [], capLines: number[] = [], debtSub: number[] = [];
  let group = "";
  let totalRevRow = 0, totalOpexRow = 0, noiRow = 0, cfbdsRow = 0, totalDebtRow = 0;

  for (const row of rows) {
    if (row.kind === "group") {
      group = row.label;
      secLines.length = 0;
      const gr = ws.addRow([row.label]);
      ws.mergeCells(gr.number, 1, gr.number, nCols);
      gr.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND } };
      gr.getCell(1).alignment = { indent: 1 };
      continue;
    }
    const isTotal = row.kind !== "line";
    const fn = row.noteKey ? byKey.get(row.noteKey) : undefined;
    const gr = ws.addRow([fn ? `${row.label}  [${fn}]` : row.label]);
    const rn = gr.number;
    rowT.set(rn, row.t);
    gr.getCell(1).font = { bold: isTotal, size: 10, color: { argb: isTotal ? BRAND : "FF1A1A1A" } };
    gr.getCell(1).alignment = { indent: row.kind === "line" ? 2 : 1 };
    edge(gr.getCell(1), 1);

    // The months + Ann Bud for a total row SUM the source rows above it; on a
    // line row they carry the source values (undefined groups → static).
    let groups: Grp[] | null = null;
    if (!isTotal) {
      secLines.push(rn);
      if (group === "Capital Improvements") capLines.push(rn);
    } else if (row.kind === "subtotal") {
      groups = [{ sign: 1, rows: [...secLines] }];
      if (group === "Revenues") revSub.push(rn);
      else if (group === "Operating Expenses") opexSub.push(rn);
      else if (group === "Debt Service") debtSub.push(rn);
      secLines.length = 0;
    } else {
      switch (row.label) {
        case "Total Revenues": groups = [{ sign: 1, rows: [...revSub] }]; totalRevRow = rn; break;
        case "Total Operating Expenses": groups = [{ sign: 1, rows: [...opexSub] }]; totalOpexRow = rn; break;
        case "Net Operating Income": groups = [{ sign: 1, rows: [totalRevRow] }, { sign: -1, rows: [totalOpexRow] }]; noiRow = rn; break;
        case "Total Debt Service": groups = [{ sign: 1, rows: [...debtSub] }]; totalDebtRow = rn; break;
        case "Cash Flow After Debt Service": groups = [{ sign: 1, rows: [cfbdsRow] }, { sign: -1, rows: [totalDebtRow] }]; break;
        default: // Cash Flow Before Debt Service / Cash Flow = NOI − capital
          groups = capLines.length ? [{ sign: 1, rows: [noiRow] }, { sign: -1, rows: [...capLines] }] : [{ sign: 1, rows: [noiRow] }];
          cfbdsRow = rn; break;
      }
    }

    for (let i = 0; i < 12; i++) {
      const f = groups ? colSum(groups, 2 + i, (r) => valBlended(r, i), row.t.blended[i]) : undefined;
      money(gr.getCell(2 + i), row.t.blended[i], { bold: isTotal, actual: i < through, brand2: isTotal, col: 2 + i, formula: f });
    }
    money(gr.getCell(14), row.t.reprojTotal, { bold: true, brand2: true, col: 14, formula: fyFormula(rn, row.t) });
    money(gr.getCell(15), row.t.budgetTotal, { bold: isTotal, col: 15, formula: groups ? colSum(groups, 15, valBudget, row.t.budgetTotal) : undefined });
    money(gr.getCell(16), row.t.variance, { bold: isTotal, col: 16, formula: varFormula(rn, row.t) });
    if (isTotal) for (let c = 1; c <= nCols; c++) {
      const cell = gr.getCell(c);
      cell.border = { ...(cell.border ?? {}), top: { style: "thin", color: { argb: BORDER } } };
      if (row.kind === "rollup") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.strong ? ROLLUP_FILL : BRAND_TINT } };
      edge(cell, c);
    }
  }

  if (r.unbudgetedAccounts.length) {
    ws.addRow([]);
    const u = ws.addRow(["Unbudgeted Actuals (not in any line)"]);
    u.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
    for (const acct of r.unbudgetedAccounts) {
      const ur = ws.addRow([acct.account]);
      ur.getCell(1).alignment = { indent: 2 };
      ur.getCell(14).value = acct.actualTotal; ur.getCell(14).numFmt = MONEY_FMT; ur.getCell(14).alignment = { horizontal: "right" };
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

// ── PDF ──────────────────────────────────────────────────────────────────────
const PAGE_W = 792, PAGE_H = 612, MARGIN = 30;
const NAVY = rgb(0.043, 0.290, 0.490), NAVY_DARK = rgb(0.039, 0.243, 0.412);
const ROLLUP = rgb(0.851, 0.894, 0.933), GROUP_TINT = rgb(0.902, 0.933, 0.961), ACTUAL = rgb(0.906, 0.949, 0.918);
const TEXT = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.4, 0.4, 0.4), RED = rgb(0.7, 0.13, 0.1), GREEN = rgb(0.08, 0.5, 0.24), WHITE = rgb(1, 1, 1);
const RULE = rgb(0.78, 0.82, 0.86);

const LINE_X = MARGIN, LINE_W = 112;
const MON_X = MARGIN + LINE_W, MON_W = 39;
const FULL_X = MON_X + MON_W * 12, FULL_W = 52;
const BUD_X = FULL_X + FULL_W, BUD_W = 42;
const VAR_X = BUD_X + BUD_W, VAR_W = 38;
const DIVIDERS = [MON_X, MON_X + MON_W * 3, MON_X + MON_W * 6, MON_X + MON_W * 9, FULL_X]; // line edge, quarters, before Full Year

function fmtMoney(v: number | null): { t: string; c: ReturnType<typeof rgb> } {
  if (v == null || Math.abs(v) < 0.5) return { t: "—", c: MUTED };
  const abs = Math.abs(Math.round(v)).toLocaleString("en-US");
  return v < 0 ? { t: `($${abs})`, c: RED } : { t: `$${abs}`, c: TEXT };
}

export async function buildReprojPdf(r: Reprojection, meta: ReprojMeta, notes: Notes = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const through = r.actualThroughMonth;
  const rows = reprojRows(r);
  const { byKey, list } = collectFootnotes(rows, notes);

  let page!: PDFPage, y = 0, tableTop = 0, pageHasColumns = false;
  const rightText = (s: string, xRight: number, yy: number, size: number, f: PDFFont, color = TEXT) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: PAGE_H - yy, size, font: f, color });
  };
  const leftText = (s: string, x: number, yy: number, size: number, f: PDFFont, color = TEXT, maxW?: number) => {
    let str = s;
    if (maxW) while (str.length > 1 && f.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -1);
    page.drawText(str, { x, y: PAGE_H - yy, size, font: f, color });
  };
  const flushDividers = () => {
    if (!pageHasColumns) return;
    for (const x of DIVIDERS) page.drawLine({ start: { x, y: PAGE_H - tableTop }, end: { x, y: PAGE_H - y }, thickness: 0.6, color: RULE });
  };
  const drawHeader = (withColumns: boolean) => {
    page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: NAVY_DARK });
    leftText(`${meta.year} Reprojection — ${meta.propertyCode} ${meta.propertyName}`, MARGIN, 18, 13, bold, WHITE);
    leftText(`Actuals Jan–${through > 0 ? MONTHS[through - 1] : "(none)"}${meta.budgetYear ? ` · Budget FY ${meta.budgetYear}` : ""}`, MARGIN, 31, 8.5, font, rgb(0.85, 0.9, 0.95));
    drawKormanLogo(page, bold, font, { xRight: PAGE_W - MARGIN, centerTop: 20, color: WHITE, scale: 0.85 });
    if (withColumns) {
      y = 54;
      page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 14), width: PAGE_W - MARGIN * 2, height: 16, color: NAVY });
      leftText("Line", LINE_X + 2, y + 11, 7.5, bold, WHITE);
      MONTHS.forEach((m, i) => rightText(m, MON_X + MON_W * (i + 1) - 2, y + 11, 7, bold, WHITE));
      rightText("Full Yr", FULL_X + FULL_W - 2, y + 11, 7.5, bold, WHITE);
      rightText("Ann Bud", BUD_X + BUD_W - 2, y + 11, 7, bold, WHITE);
      rightText("Var", VAR_X + VAR_W - 2, y + 11, 7.5, bold, WHITE);
      y += 18;
      tableTop = y - 2;
      pageHasColumns = true;
    } else {
      y = 52;
      pageHasColumns = false;
    }
  };
  const newPage = (withColumns = true) => { if (page) flushDividers(); page = doc.addPage([PAGE_W, PAGE_H]); drawHeader(withColumns); };
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
    if (isTotal) page.drawLine({ start: { x: MARGIN, y: PAGE_H - (y - 1) }, end: { x: PAGE_W - MARGIN, y: PAGE_H - (y - 1) }, thickness: 0.8, color: rgb(0.55, 0.6, 0.66) });
    if (row.kind === "rollup") page.drawRectangle({ x: MARGIN, y: PAGE_H - (y + 11), width: PAGE_W - MARGIN * 2, height: rowH, color: ROLLUP });
    if (!isTotal && through > 0) page.drawRectangle({ x: MON_X, y: PAGE_H - (y + 11), width: MON_W * through, height: rowH, color: ACTUAL });
    const f = isTotal ? bold : font;
    const fn = row.noteKey ? byKey.get(row.noteKey) : undefined;
    leftText(row.label + (fn ? ` [${fn}]` : ""), LINE_X + (isTotal ? 2 : 6), y + 9, isTotal ? 7.5 : 7, f, isTotal ? NAVY : TEXT, LINE_W - 6);
    for (let i = 0; i < 12; i++) {
      const m = fmtMoney(row.t.blended[i]);
      rightText(m.t, MON_X + MON_W * (i + 1) - 2, y + 9, 6.5, f, isTotal ? NAVY : m.c);
    }
    rightText(fmtMoney(row.t.reprojTotal).t, FULL_X + FULL_W - 2, y + 9, 7, bold, NAVY);
    rightText(fmtMoney(row.t.budgetTotal).t, BUD_X + BUD_W - 2, y + 9, 6.5, f, isTotal ? NAVY : MUTED);
    const vv = row.t.variance;
    rightText(vv == null ? "—" : fmtMoney(vv).t, VAR_X + VAR_W - 2, y + 9, 6.5, f, vv == null ? MUTED : vv >= 0 ? GREEN : RED);
    y += rowH;
  }
  flushDividers();

  if (list.length) {
    newPage(false); // notes on their own page, no column header
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
      leftText(prefix, MARGIN, y + 8, 8, bold, NAVY);
      for (const seg of segs) {
        if (y > PAGE_H - MARGIN - 14) newPage(false);
        leftText(seg.text, MARGIN + seg.indent, y + 8, 8, font, TEXT);
        y += 11;
      }
      y += 3;
    }
  }

  leftText(`Report run ${reportStamp()}`, MARGIN, PAGE_H - MARGIN + 14, 8, font, MUTED);
  return doc.save();
}
