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
  other?: number;
  taxesEr?: number;
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
