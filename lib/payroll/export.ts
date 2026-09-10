import * as XLSX from "xlsx";

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

export function buildPayrollExportXlsx(args: BuildPayrollExportArgs): Blob {
  const { payDate, invoices } = args;
  const wb = XLSX.utils.book_new();

  const header = ["Property", "Property Code", "Salary REC", "Salary NR", "Overtime", "HOL REC", "HOL NR", "401K (ER)", "Other", "Taxes (ER)", "Total"];
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
  ]);

  // Totals row
  const totals = [
    "Total", "",
    rows.reduce((s, r) => s + (r[2] as number), 0),
    rows.reduce((s, r) => s + (r[3] as number), 0),
    rows.reduce((s, r) => s + (r[4] as number), 0),
    rows.reduce((s, r) => s + (r[5] as number), 0),
    rows.reduce((s, r) => s + (r[6] as number), 0),
    rows.reduce((s, r) => s + (r[7] as number), 0),
    rows.reduce((s, r) => s + (r[8] as number), 0),
    rows.reduce((s, r) => s + (r[9] as number), 0),
    rows.reduce((s, r) => s + (r[10] as number), 0),
  ];

  const aoa: (string | number)[][] = [
    ...(payDate ? [[`Pay Date: ${payDate}`], []] : []),
    header,
    ...rows,
    totals,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Format columns C:K as currency (2 decimals, thousands separator)
  const currencyFmt = "#,##0.00";
  const headerRowIdx = payDate ? 2 : 0;
  const lastRowIdx = headerRowIdx + rows.length + 1;
  for (let r = headerRowIdx + 1; r <= lastRowIdx; r++) {
    for (let c = 2; c <= 10; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = currencyFmt;
      }
    }
  }

  // Live totals: each row's Total = SUM(its components) and the bottom Total row
  // = SUM(down each column), so the workbook recomputes if a figure is edited
  // rather than showing a stale hand-computed number. Cached values stay in place;
  // a per-row Total that doesn't reconcile keeps its static value.
  const dataFirst = headerRowIdx + 1;          // 0-based first data row
  const dataLast = headerRowIdx + rows.length; // 0-based last data row
  const a1 = (c: number, r0: number) => `${XLSX.utils.encode_col(c)}${r0 + 1}`;
  rows.forEach((r, idx) => {
    const r0 = dataFirst + idx;
    let sum = 0; for (let c = 2; c <= 9; c++) sum += r[c] as number;
    const cell = ws[a1(10, r0)];
    if (cell && Math.abs(sum - (r[10] as number)) < 0.5) cell.f = `SUM(${a1(2, r0)}:${a1(9, r0)})`;
  });
  if (rows.length > 0) for (let c = 2; c <= 10; c++) {
    const cell = ws[a1(c, lastRowIdx)];
    if (cell && typeof cell.v === "number") cell.f = `SUM(${a1(c, dataFirst)}:${a1(c, dataLast)})`;
  }

  XLSX.utils.book_append_sheet(wb, ws, "Payroll Summary");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
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
