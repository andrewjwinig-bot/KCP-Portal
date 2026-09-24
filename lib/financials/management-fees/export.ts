// Management Fees Excel export — the page's grid, as the page lays it out: a
// building per row, the months across, then the full-year reprojection, the
// budget and the variance. A month the building has not posted carries its
// budget (italic, muted), so each row sums to where the year should land — the
// Reprojections convention (actual to date + budget for the rest). Below it the
// portfolio Actual vs Budget, months across the same way.
//
// Built on the shared theme (`lib/excel/theme.ts`), and every total is a live
// formula per the workbook convention: a row's reprojection sums its months, a
// group subtotal sums its buildings, the grand total sums the SUBTOTALS (never
// the buildings again), and the variance columns are differences of the cells
// beside them — so an edited month flows through. Each formula is written only
// where it reconciles to the figure the page computed (`liveSum` / `liveAdd`).

import type ExcelJS from "exceljs";
import type { MgmtFeeData } from "./compute";
import { COLOR, FMT, FONT_NAME, PRINT_WIDE, footNote, freezeAbove, headerBand, liveAdd, liveFormula, liveSum, newWorkbook, repeatHeader, sectionBar, titleBlock, totalEmphasis } from "@/lib/excel/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Columns: A code · B building · C–N Jan–Dec · O reprojection · P budget · Q var $ · R var %
const COL_CODE = 1, COL_NAME = 2, COL_M1 = 3, COL_REPROJ = 15, COL_BUDGET = 16, COL_VAR = 17, COL_VARPCT = 18;
const WIDTH = COL_VARPCT;

const colLetter = (c: number) => String.fromCharCode(64 + c);
const addr = (c: number, r: number) => `${colLetter(c)}${r}`;
const sum = (a: number[]) => a.reduce((t, v) => t + (Number(v) || 0), 0);

type Building = MgmtFeeData["buildings"][number];

/** Each building's months: posted fee through its last posted month, budget after. */
export function reprojMonths(b: Building): number[] {
  return MONTHS.map((_, m) => (m + 1 <= b.maxPosted ? b.feeMonthly[m] : b.budgetMonthly[m]) || 0);
}

export async function buildManagementFeesWorkbook(data: MgmtFeeData): Promise<ExcelJS.Workbook> {
  const { buildings, portfolio, year, completeThrough, groups } = data;
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Management Fees", { pageSetup: { ...PRINT_WIDE } });
  ws.columns = [
    { width: 8 }, { width: 30 },
    ...MONTHS.map(() => ({ width: 11 })),
    { width: 13 }, { width: 13 }, { width: 12 }, { width: 8 },
  ];

  let r = titleBlock(ws, {
    entity: "LIK Management",
    document: "Management Fees by Building",
    asOf: `FY ${year}${completeThrough ? ` · posted through ${MONTHS_LONG[completeThrough - 1]}` : ""}`,
    meta: ["Account 6610 · months not yet posted carry the building's budget"],
    width: WIDTH,
  });
  r++;

  const headerRow = r;
  headerBand(ws, r, ["Code", "Building", ...MONTHS, `${year} Reproj.`, "Budget", "vs Budget", "%"]);
  ws.getCell(r, COL_NAME).alignment = { horizontal: "left", vertical: "middle" };
  r++;

  const money = (cell: ExcelJS.Cell) => { cell.numFmt = FMT.money; cell.font = { name: FONT_NAME, size: 10 }; };

  /** The variance pair beside a row's reprojection and budget. */
  const writeVariance = (row: number, reproj: number, budget: number) => {
    const v = reproj - budget;
    const varCell = ws.getCell(row, COL_VAR);
    varCell.value = liveFormula(`${addr(COL_REPROJ, row)}-${addr(COL_BUDGET, row)}`, v, reproj - budget);
    varCell.numFmt = FMT.money;
    const pctCell = ws.getCell(row, COL_VARPCT);
    pctCell.value = budget
      ? { formula: `IF(${addr(COL_BUDGET, row)}=0,"",${addr(COL_VAR, row)}/${addr(COL_BUDGET, row)})`, result: v / budget }
      : null;
    pctCell.numFmt = FMT.percent;
  };

  const subtotalRows: { row: number; reproj: number; budget: number; months: number[] }[] = [];

  for (const g of groups) {
    const rows = buildings.filter((b) => b.group === g.key);
    if (!rows.length) continue;
    sectionBar(ws, r, g.label, WIDTH, { strong: false });
    r++;
    const first = r;
    for (const b of rows) {
      const months = reprojMonths(b);
      ws.getCell(r, COL_CODE).value = b.code;
      ws.getCell(r, COL_CODE).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLOR.brand } };
      ws.getCell(r, COL_NAME).value = b.name;
      ws.getCell(r, COL_NAME).font = { name: FONT_NAME, size: 10 };
      months.forEach((v, m) => {
        const cell = ws.getCell(r, COL_M1 + m);
        cell.value = v;
        money(cell);
        // Not posted yet: the budget standing in for it, read as a projection.
        if (m + 1 > b.maxPosted) cell.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: COLOR.muted } };
      });
      const reproj = sum(months);
      const rc = ws.getCell(r, COL_REPROJ);
      rc.value = liveSum(`${addr(COL_M1, r)}:${addr(COL_M1 + 11, r)}`, reproj, months);
      rc.numFmt = FMT.money;
      rc.font = { name: FONT_NAME, size: 10, bold: true };
      rc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.brandTint } };
      const bc = ws.getCell(r, COL_BUDGET);
      bc.value = b.annualBudget;
      bc.numFmt = FMT.money;
      bc.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.muted } };
      writeVariance(r, reproj, b.annualBudget);
      r++;
    }
    const last = r - 1;

    // The group's subtotal: each column sums its own buildings.
    const months = MONTHS.map((_, m) => sum(rows.map((b) => reprojMonths(b)[m])));
    const reproj = sum(months);
    const budget = sum(rows.map((b) => b.annualBudget));
    ws.getCell(r, COL_CODE).value = `Total ${g.label}`;
    for (let c = COL_M1; c <= COL_BUDGET; c++) {
      const src = c <= COL_M1 + 11 ? rows.map((b) => reprojMonths(b)[c - COL_M1])
        : c === COL_REPROJ ? rows.map((b) => sum(reprojMonths(b)))
        : rows.map((b) => b.annualBudget);
      const expected = c <= COL_M1 + 11 ? months[c - COL_M1] : c === COL_REPROJ ? reproj : budget;
      const cell = ws.getCell(r, c);
      cell.value = liveSum(`${addr(c, first)}:${addr(c, last)}`, expected, src);
      cell.numFmt = FMT.money;
    }
    writeVariance(r, reproj, budget);
    for (let c = 1; c <= WIDTH; c++) {
      totalEmphasis(ws.getCell(r, c));
      ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.rollupTint } };
    }
    ws.getCell(r, COL_CODE).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLOR.brand } };
    subtotalRows.push({ row: r, reproj, budget, months });
    r++;
  }

  // The grand total sums the SUBTOTALS — the buildings again would double-count.
  if (subtotalRows.length) {
    r++;
    ws.getCell(r, COL_CODE).value = "Total";
    for (let c = COL_M1; c <= COL_BUDGET; c++) {
      const parts = subtotalRows.map((s) => (c <= COL_M1 + 11 ? s.months[c - COL_M1] : c === COL_REPROJ ? s.reproj : s.budget));
      const cell = ws.getCell(r, c);
      cell.value = liveAdd(subtotalRows.map((s) => addr(c, s.row)), sum(parts), parts);
      cell.numFmt = FMT.money;
    }
    const reproj = sum(subtotalRows.map((s) => s.reproj));
    const budget = sum(subtotalRows.map((s) => s.budget));
    writeVariance(r, reproj, budget);
    for (let c = 1; c <= WIDTH; c++) totalEmphasis(ws.getCell(r, c), { grand: true });
    r += 2;
  }

  // ── Portfolio Actual vs Budget, months across ─────────────────────────────
  const hasLik = !!portfolio.likPlanMonthly;
  sectionBar(ws, r, "Actual vs Budget — portfolio", WIDTH);
  r++;
  headerBand(ws, r, ["", "", ...MONTHS, "Total"]);
  r++;
  const actual = portfolio.actualMonthly.map((v, m) => (completeThrough && m + 1 <= completeThrough ? v : 0));
  const summaryRow = (label: string, values: number[], opts?: { muted?: boolean }) => {
    const row = r;
    ws.getCell(row, COL_CODE).value = label;
    ws.getCell(row, COL_CODE).font = { name: FONT_NAME, size: 10, bold: true };
    values.forEach((v, m) => {
      const cell = ws.getCell(row, COL_M1 + m);
      cell.value = v;
      cell.numFmt = FMT.money;
      cell.font = { name: FONT_NAME, size: 10, ...(opts?.muted ? { color: { argb: COLOR.muted } } : {}) };
    });
    const t = ws.getCell(row, COL_REPROJ);
    t.value = liveSum(`${addr(COL_M1, row)}:${addr(COL_M1 + 11, row)}`, sum(values), values);
    t.numFmt = FMT.money;
    totalEmphasis(t);
    r++;
    return row;
  };
  const aRow = summaryRow(`Actual${completeThrough ? ` (through ${MONTHS[completeThrough - 1]})` : ""}`, actual);
  const bRow = summaryRow("Budget (bottom-up)", portfolio.budgetBottomUpMonthly, { muted: true });
  if (hasLik) summaryRow("LIK 2010 fee plan (4510)", portfolio.likPlanMonthly!, { muted: true });
  // Variance % on the months both have — a month not posted yet has no actual.
  ws.getCell(r, COL_CODE).value = "Actual vs budget";
  ws.getCell(r, COL_CODE).font = { name: FONT_NAME, size: 10, italic: true };
  for (let m = 0; m < 12; m++) {
    const bud = portfolio.budgetBottomUpMonthly[m];
    if (!(completeThrough && m + 1 <= completeThrough) || !bud) continue;
    const cell = ws.getCell(r, COL_M1 + m);
    cell.value = { formula: `IF(${addr(COL_M1 + m, bRow)}=0,"",${addr(COL_M1 + m, aRow)}/${addr(COL_M1 + m, bRow)}-1)`, result: actual[m] / bud - 1 };
    cell.numFmt = FMT.percent;
  }
  r += 2;

  footNote(ws, r,
    "Posted months are each building's account 6610 as the GL reports it; months a building has not posted yet carry that building's budget (italic), so each row totals to the full-year reprojection. " +
    "Budget is each building's 6610 budget line. The LIK plan is 2010's budgeted fee revenue (4510), the other side of the same intercompany entry. Unaudited.",
    WIDTH);

  freezeAbove(ws, headerRow, COL_NAME);
  repeatHeader(ws, headerRow);
  return wb;
}

/** Builds the workbook and hands it to the browser as a download. */
export async function exportManagementFeesXlsx(data: MgmtFeeData): Promise<void> {
  const wb = await buildManagementFeesWorkbook(data);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Management_Fees_${data.year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
