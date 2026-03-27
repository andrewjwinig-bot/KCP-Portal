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
    const nr  = (inv.salaryNR   ?? 0) + (inv.holNR     ?? 0)
              + (inv.er401kNR   ?? 0) + (inv.taxesErNR ?? 0) + (inv.otherNR  ?? 0);
    const rec = (inv.salaryREC  ?? 0) + (inv.holREC    ?? 0) + (inv.overtime ?? 0)
              + (inv.er401kREC  ?? 0) + (inv.taxesErREC?? 0) + (inv.otherREC ?? 0);

    if (Math.abs(nr) > 0.005) {
      rows.push(["JRNL", "2000", "8080-0000", "DW", dateStr, `Total NR Payroll for ${propKey}`, periodCode, -Math.round(nr * 100) / 100]);
      offsetTotal += nr;
    }
    if (Math.abs(rec) > 0.005) {
      rows.push(["JRNL", "2000", "8080-0000", "DW", dateStr, `Total REC Payroll for ${propKey}`, periodCode, -Math.round(rec * 100) / 100]);
      offsetTotal += rec;
    }
  }

  // Offset row — positive sum of all property lines
  rows.push(["JRNL", "2000", "0110-0000", "DW", dateStr, "Total Prop Payroll Reimbursement", periodCode, Math.round(offsetTotal * 100) / 100]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

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
