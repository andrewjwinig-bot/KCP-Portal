import * as XLSX from "xlsx";
import {
  newWorkbook, titleBlock, headerBand, footNote, freezeAbove, repeatHeader,
  liveSum, liveFormula, totalEmphasis, COLOR, FMT, FONT_NAME, PRINT_WIDE,
} from "@/lib/excel/theme";

// TWO workbooks, and only ONE of them is a document.
//
// The Payroll Summary rides the AvidXchange team email to Marie, Drew and
// Harry, who READ it — so it carries the house letterhead and formatting like
// every other workbook the portal hands a person.
//
// The GL Journal Entry below does NOT. It is a machine import: no header row,
// no title, data from row 1, positional columns
// (JRNL | entity | account | DW | date | description | period | amount). A
// letterhead would shift every row and break the import on the first line. It
// stays raw deliberately — see the note above `buildPayrollGLXlsx`.

export type PayrollExportInvoice = {
  propertyKey: string;
  propertyLabel?: string;
  propertyCode?: string;
  salaryREC?: number;
  salaryNR?: number;
  overtime?: number;
  holREC?: number;
  holNR?: number;
  er401k?: number;
  er401kREC?: number;
  er401kNR?: number;
  other?: number;
  otherREC?: number;
  otherNR?: number;
  taxesEr?: number;
  taxesErREC?: number;
  taxesErNR?: number;
  total?: number;
};

export type BuildPayrollExportArgs = {
  payDate?: string | null;
  invoices: PayrollExportInvoice[];
};

export async function buildPayrollExportXlsx(args: BuildPayrollExportArgs): Promise<Blob> {
  const { payDate, invoices } = args;
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Payroll Summary", { pageSetup: { ...PRINT_WIDE } });

  const HEAD = ["Property", "Property Code", "Salary REC", "Salary NR", "Overtime", "HOL REC", "HOL NR", "401K (ER)", "Other", "Taxes (ER)", "Total"];
  ws.columns = [{ width: 30 }, { width: 14 }, ...Array.from({ length: 9 }, () => ({ width: 13 }))];

  const headerRow = titleBlock(ws, {
    entity: "Korman Commercial Properties",
    document: "Payroll Allocation Summary",
    asOf: payDate ? `Pay date ${payDate}` : null,
    width: HEAD.length,
  });
  headerBand(ws, headerRow, HEAD);

  const rows = invoices.map((r) => [
    r.propertyLabel || r.propertyKey,
    r.propertyCode || r.propertyKey,
    r.salaryREC ?? 0,
    r.salaryNR ?? 0,
    r.overtime ?? 0,
    r.holREC ?? 0,
    r.holNR ?? 0,
    r.er401k ?? 0,
    r.other ?? 0,
    r.taxesEr ?? 0,
    r.total ?? 0,
  ] as (string | number)[]);

  const firstBody = headerRow + 1;
  rows.forEach((values, i) => {
    const row = ws.getRow(firstBody + i);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text } };
      if (typeof v === "number") { cell.numFmt = FMT.moneyCents; cell.alignment = { horizontal: "right" }; }
    });
    // Each row's Total = SUM(its own components), so editing a component flows
    // through rather than leaving a stale hand-computed figure. A row that does
    // not reconcile keeps its static value.
    const components = values.slice(2, 10).map((v) => Number(v) || 0);
    const r1 = firstBody + i;
    row.getCell(11).value = liveSum(`C${r1}:J${r1}`, Number(values[10]) || 0, components);
    row.getCell(11).numFmt = FMT.moneyCents;
    row.getCell(11).alignment = { horizontal: "right" };
    if (i % 2 === 1) for (let c = 1; c <= HEAD.length; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
    }
  });

  const lastBody = firstBody + rows.length - 1;
  const totalRow = ws.getRow(lastBody + 1);
  totalRow.getCell(1).value = "Total";
  for (let c = 1; c <= HEAD.length; c++) totalEmphasis(totalRow.getCell(c), { grand: true });
  if (rows.length > 0) for (let c = 3; c <= HEAD.length; c++) {
    const L = ws.getColumn(c).letter;
    const sources = rows.map((r) => Number(r[c - 1]) || 0);
    const cell = totalRow.getCell(c);
    cell.value = liveSum(`${L}${firstBody}:${L}${lastBody}`, sources.reduce((s, v) => s + v, 0), sources);
    cell.numFmt = FMT.moneyCents;
    cell.alignment = { horizontal: "right" };
  }

  freezeAbove(ws, headerRow);
  repeatHeader(ws, headerRow);
  footNote(
    ws, lastBody + 3,
    "REC lines are recoverable through CAM; NR lines are not. Figures are the employer cost allocated to each property " +
    "for this pay period, matching the per-property invoice PDFs sent to AP.",
    HEAD.length, 30,
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ── GL Journal Entry ──────────────────────────────────────────────────────────

/** Parse a pay date string ("M/D/YYYY" or "MM/DD/YYYY") into its components. */
function parsePayDate(payDate: string): { month: number; day: number; year: number } | null {
  const m = payDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10), year: parseInt(m[3], 10) };
}

/** Format pay date as MMDDYY (e.g. Oct 28 2025 → "102825"). */
function formatPayDateMMDDYY(payDate: string): string {
  const p = parsePayDate(payDate);
  if (!p) return "";
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  const yy = String(p.year).slice(2);
  return `${mm}${dd}${yy}`;
}

/** Determine pay period number (1, 2, or 3) for a bi-weekly payroll based on day of month. */
function payPeriodNum(payDate: string): number {
  const p = parsePayDate(payDate);
  if (!p) return 1;
  if (p.day <= 14) return 1;
  if (p.day <= 28) return 2;
  return 3;
}

/** Build the GL period code: "PR" + 2-digit month + period number (e.g. "PR011"). */
function glPeriodCode(payDate: string): string {
  const p = parsePayDate(payDate);
  if (!p) return "PR";
  const mm = String(p.month).padStart(2, "0");
  return `PR${mm}${payPeriodNum(payDate)}`;
}

/**
 * The GL Journal Entry — a MACHINE IMPORT, deliberately unthemed.
 *
 * No header row, no title, data from row 1, positional columns. The accounting
 * system reads it by position, so a letterhead would shift every row and break
 * the import on its first line. It stays on SheetJS and stays raw; the
 * workbook theme is for documents a person reads.
 */
export function buildPayrollGLXlsx(args: BuildPayrollExportArgs): Blob {
  const { payDate, invoices } = args;

  const dateStr   = payDate ? formatPayDateMMDDYY(payDate) : "";
  const periodCode = payDate ? glPeriodCode(payDate) : "PR";

  const rows: (string | number)[][] = [];

  let offsetTotal = 0;

  for (const inv of invoices) {
    const propKey = inv.propertyKey;
    // Match the invoice PDF subtotals exactly
    const nr  = Math.round(((inv.salaryNR   ?? 0) + (inv.holNR     ?? 0)
              + (inv.er401kNR   ?? 0) + (inv.taxesErNR ?? 0) + (inv.otherNR  ?? 0)) * 100) / 100;
    const rec = Math.round(((inv.salaryREC  ?? 0) + (inv.holREC    ?? 0) + (inv.overtime ?? 0)
              + (inv.er401kREC  ?? 0) + (inv.taxesErREC?? 0) + (inv.otherREC ?? 0)) * 100) / 100;

    if (Math.abs(nr) > 0.005) {
      rows.push(["JRNL", "2000", "8080-0000", "DW", dateStr, `Total NR Payroll for ${propKey}`, periodCode, -nr]);
      offsetTotal += nr;
    }
    if (Math.abs(rec) > 0.005) {
      rows.push(["JRNL", "2000", "8080-0000", "DW", dateStr, `Total REC Payroll for ${propKey}`, periodCode, -rec]);
      offsetTotal += rec;
    }
  }

  // Offset row — rounded sum of already-rounded property lines so column H nets to $0
  const lineCount = rows.length;
  rows.push(["JRNL", "2000", "0110-0000", "DW", dateStr, "Total Prop Payroll Reimbursement", periodCode, Math.round(offsetTotal * 100) / 100]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Make the offset a live =-SUM(property lines) so column H (Amount) always nets
  // to exactly $0, self-correcting if a line is edited. Cached value stays.
  if (lineCount > 0) {
    const H = XLSX.utils.encode_col(7); // column H = Amount
    const cell = ws[`${H}${lineCount + 1}`];
    if (cell) cell.f = `-SUM(${H}1:${H}${lineCount})`;
  }

  // Column widths
  ws["!cols"] = [
    { wch: 6 },   // A JRNL
    { wch: 6 },   // B Entity
    { wch: 12 },  // C Account
    { wch: 4 },   // D DW
    { wch: 10 },  // E Date
    { wch: 38 },  // F Description
    { wch: 8 },   // G Period
    { wch: 14 },  // H Amount
  ];

  XLSX.utils.book_append_sheet(wb, ws, "GL Journal Entry");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
