// The one look every workbook this portal produces is built from.
//
// Five ExcelJS exports each styled themselves from scratch, and they had drifted
// exactly the way the pages drift: the same navy re-typed in five files, the
// accounting number format re-typed in four and written a fifth way in the TOP
// SHEET, `wb.creator` reading "KCP Portal" in four files and "Korman Commercial
// Properties" in the fifth, and print setup configured in one workbook out of
// five — so a lender who opened a balance sheet and hit Print got whatever
// Excel guessed. Two workbooks from the same portal, side by side, did not read
// as coming from the same company.
//
// So the tokens and the primitives live here and nothing re-types them. A new
// export calls `newWorkbook()` and `titleBlock()` and is already consistent; an
// export that needs a colour the palette lacks adds it HERE, the same rule the
// UI has for `Pill.tsx`.
//
// Two things in this file are correctness, not decoration:
//
//   * `newWorkbook()` sets `calcProperties.fullCalcOnLoad`. ExcelJS DROPS a
//     cached `result: 0` when it writes a formula cell, so any total that
//     legitimately nets to zero opens BLANK until Excel recalculates. The
//     balance sheet found this the hard way — the proof row is the one cell
//     meant to read zero, and it was the one cell that opened empty. Every
//     workbook with formulas has the same exposure, so the flag belongs to the
//     constructor rather than to whoever remembers.
//
//   * `liveSum` / `liveFormula` are the single implementation of the safety
//     pattern CLAUDE.md requires: write the formula only if it reconciles to
//     the total we already computed, else fall back to the static number, so an
//     unusual data shape can never put a wrong figure in front of a lender.
//     It had been copied into `statementExport` and `reprojExport` separately.

// Deliberately NOT `server-only`. The TOP SHEET is built in the browser
// (`app/expenses/page.tsx`), and the client-side exports still on SheetJS are
// the ones this theme most needs to reach once they migrate — a server guard
// here would be a wall across the migration it exists to enable. Nothing in
// this file touches a request, a store or a secret.
import ExcelJS from "exceljs";

export const KORMAN_TEXT = "KORMAN  COMMERCIAL PROPERTIES";

// ── Palette ────────────────────────────────────────────────────────────────
// ARGB, because that is what ExcelJS takes. Deep navy is the house colour; the
// tints are washes for section bands and subtotal rows, light enough that black
// text on them still prints legibly on a mono printer.
export const COLOR = {
  brand: "FF0B4A7D",
  brandDark: "FF0A3E69",
  brandTint: "FFE6EEF5",
  rollupTint: "FFD9E4EE",
  border: "FFB7C2CC",
  white: "FFFFFFFF",
  text: "FF1A1A1A",
  muted: "FF666666",
  faint: "FF9AA4B2",
  positive: "FF15803D",
  negative: "FFB91C1C",
  warn: "FFB45309",
  warnTint: "FFFDE9C8",
  positiveTint: "FFDCFCE7",
  zebra: "FFFAFBFC",
} as const;

// ── Number formats ─────────────────────────────────────────────────────────
// Accounting style throughout: negatives red and in parentheses, zero as an
// em-dash, and the currency symbol pushed to the column edge so the digits line
// up down the column whatever the magnitude.
export const FMT = {
  money: '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)',
  moneyCents: '_("$"* #,##0.00_);[Red]_("$"* (#,##0.00);_("$"* "—"_);_(@_)',
  number: '#,##0',
  numberCents: '#,##0.00',
  percent: '0.0%',
  percent2: '0.00%',
  // A ratio the model or a caller already expressed as 0-100 rather than 0-1.
  percentPoints: '0.0"%"',
  date: 'mm/dd/yyyy',
  sqft: '#,##0',
} as const;

export const FONT_NAME = "Calibri";

// ── Print ──────────────────────────────────────────────────────────────────
// Letter, fit to ONE page wide and as many pages tall as it takes. Never fit to
// height: a 300-row rent roll squeezed onto one page is unreadable, and the
// person printing wants the columns intact far more than the page count.
//
// `paperSize` is deliberately absent — ExcelJS encodes Letter as `undefined`,
// so setting it is how you get something that is not Letter.
const MARGINS = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
export const PRINT_WIDE: Partial<ExcelJS.PageSetup> = {
  orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: MARGINS,
};
export const PRINT_TALL: Partial<ExcelJS.PageSetup> = {
  orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: MARGINS,
};

/** A workbook with the house identity and the recalc flag already set. */
export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Korman Commercial Properties";
  wb.lastModifiedBy = "Korman Commercial Properties";
  wb.company = "Korman Commercial Properties";
  wb.created = new Date();
  // See the note at the top of this file — this is why a zero total is visible.
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

/** Repeat these rows at the top of every printed page. */
export function repeatHeader(ws: ExcelJS.Worksheet, firstRow: number, lastRow = firstRow) {
  ws.pageSetup.printTitlesRow = `${firstRow}:${lastRow}`;
}

/** Freeze everything above `row` (and optionally left of `xSplit`). */
export function freezeAbove(ws: ExcelJS.Worksheet, row: number, xSplit = 0) {
  ws.views = [{ state: "frozen", xSplit, ySplit: row }];
}

// ── Letterhead ─────────────────────────────────────────────────────────────

export type TitleBlock = {
  /** The legal entity the document is about — the biggest line. */
  entity: string;
  /** What the document IS: "Balance Sheet", "Operating Statement". */
  document: string;
  /** The property, when it differs from the entity. */
  subtitle?: string | null;
  /** "As of September 30, 2026", "FY 2026 through July". */
  asOf?: string | null;
  /** Anything else identifying — "EIN 12-3456789", "Prepared 9/16/2026". */
  meta?: (string | null | undefined)[];
  /** How many columns the block spans, so the fills reach the table's edge. */
  width: number;
  startRow?: number;
};

/**
 * The letterhead every workbook opens with, returning the next free row.
 *
 * A workbook is forwarded — to a lender, an accountant, an investor — far more
 * often than it is read in place, so it has to say what it is and what it is
 * about without the email it arrived in. The banner is filled rather than plain
 * so the identity survives being pasted into another workbook, where a bare
 * bold row reads as just another heading.
 */
export function titleBlock(ws: ExcelJS.Worksheet, o: TitleBlock): number {
  const w = Math.max(1, o.width);
  let r = o.startRow ?? 1;

  const band = (text: string, fill: string, font: Partial<ExcelJS.Font>, height: number) => {
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { name: FONT_NAME, ...font };
    for (let c = 1; c <= w; c++) {
      ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }
    cell.alignment = { vertical: "middle" };
    if (w > 1) ws.mergeCells(r, 1, r, w);
    ws.getRow(r).height = height;
    r++;
  };

  band(KORMAN_TEXT, COLOR.brand, { size: 9, bold: true, color: { argb: COLOR.white } }, 16);
  band(o.entity, COLOR.brandDark, { size: 14, bold: true, color: { argb: COLOR.white } }, 24);
  const sub = [o.document, o.subtitle && o.subtitle !== o.entity ? o.subtitle : null, o.asOf].filter(Boolean).join("  ·  ");
  band(sub, COLOR.brand, { size: 10.5, italic: true, color: { argb: COLOR.white } }, 18);

  const meta = (o.meta ?? []).filter((m): m is string => !!m && !!m.trim());
  if (meta.length) {
    const cell = ws.getCell(r, 1);
    cell.value = meta.join("   ·   ");
    cell.font = { name: FONT_NAME, size: 9, italic: true, color: { argb: COLOR.muted } };
    if (w > 1) ws.mergeCells(r, 1, r, w);
    r++;
  }
  return r;
}

/** A tinted band naming a section, spanning the table. */
export function sectionBar(ws: ExcelJS.Worksheet, row: number, label: string, width: number, opts?: { strong?: boolean }) {
  const strong = opts?.strong ?? true;
  const cell = ws.getCell(row, 1);
  cell.value = label;
  cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: strong ? COLOR.white : COLOR.brand } };
  for (let c = 1; c <= width; c++) {
    ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: strong ? COLOR.brand : COLOR.brandTint } };
  }
  ws.getRow(row).height = 18;
}

/** The brand-filled column-header row. Labels are written left to right. */
export function headerBand(ws: ExcelJS.Worksheet, row: number, labels: (string | null)[], opts?: { firstCol?: number; align?: ExcelJS.Alignment["horizontal"] }) {
  const first = opts?.firstCol ?? 1;
  labels.forEach((label, i) => {
    const cell = ws.getCell(row, first + i);
    cell.value = label ?? null;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLOR.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.brand } };
    // The first column identifies the row; the rest are almost always figures.
    cell.alignment = { horizontal: i === 0 ? "left" : (opts?.align ?? "right"), vertical: "middle", wrapText: true };
  });
  ws.getRow(row).height = 22;
}

/** Rule above a total, double rule under a grand total. */
export function totalEmphasis(cell: ExcelJS.Cell, opts?: { grand?: boolean }) {
  cell.font = { name: FONT_NAME, size: opts?.grand ? 11 : 10, bold: true, color: { argb: opts?.grand ? COLOR.brand : COLOR.text } };
  cell.border = { top: { style: "thin", color: { argb: COLOR.border } }, ...(opts?.grand ? { bottom: { style: "double" as const, color: { argb: COLOR.brand } } } : {}) };
}

/**
 * A closing note — the basis of presentation, what was counted, what is missing.
 *
 * Every workbook that leaves the building carries one. A figure without its
 * basis is the thing that causes trouble: a market-value statement read as
 * cost-basis, a YTD column read as a full year.
 */
export function footNote(ws: ExcelJS.Worksheet, row: number, text: string, width: number, height = 42) {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: FONT_NAME, size: 8, italic: true, color: { argb: COLOR.muted } };
  cell.alignment = { wrapText: true, vertical: "top" };
  if (width > 1) ws.mergeCells(row, 1, row, width);
  ws.getRow(row).height = height;
}

// ── Live formulas ──────────────────────────────────────────────────────────

/**
 * A formula cell — but only if the formula actually produces the number we
 * already know to be right.
 *
 * The rule (CLAUDE.md): every total in an export is a live formula so the
 * numbers tie when someone edits a line. The safety half matters just as much —
 * `evaluated` is what the formula WOULD produce, computed here in JS, and if it
 * disagrees with `expected` by more than half a dollar the formula is wrong for
 * this data shape and a static number goes in instead. A displayed value is
 * never wrong; at worst it stops being editable.
 *
 * `result` is always cached so the figure shows before Excel recalculates.
 */
export function liveFormula(formula: string, expected: number, evaluated: number, tol = 0.5): ExcelJS.CellValue {
  if (!formula) return expected;
  if (!Number.isFinite(evaluated) || !Number.isFinite(expected)) return expected;
  if (Math.abs(evaluated - expected) > tol) return expected;
  return { formula, result: expected };
}

/** `SUM(range)` when it reconciles to `expected`, else the static total. */
export function liveSum(range: string, expected: number, sources: number[], tol = 0.5): ExcelJS.CellValue {
  if (!sources.length) return expected;
  return liveFormula(`SUM(${range})`, expected, sources.reduce((t, v) => t + (Number(v) || 0), 0), tol);
}

/** `A5+A9+A14` over named cells — for a total that sums SUBTOTALS, never the
 *  line items again, which would double-count. */
export function liveAdd(cells: string[], expected: number, sources: number[], tol = 0.5): ExcelJS.CellValue {
  if (!cells.length || cells.length !== sources.length) return expected;
  return liveFormula(cells.join("+"), expected, sources.reduce((t, v) => t + (Number(v) || 0), 0), tol);
}
