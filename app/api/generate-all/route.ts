import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { z } from "zod";
import * as XLSX from "xlsx";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";
import { renderInvoicePdf } from "../../../lib/pdf/renderInvoicePdf";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const BodySchema = z.object({
  payroll: z.any(),
  invoices: z.array(z.any()).optional(),
  employees: z.array(z.any()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const allocationPath = path.join(process.cwd(), "data", "allocation.xlsx");
    const allocBuf = await readFile(allocationPath);
    const allocation = parseAllocationWorkbook(allocBuf);

    const invoices = body.invoices?.length ? body.invoices : buildInvoices(body.payroll, allocation as any);
    const employees: any[] = body.employees ?? [];

    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();
    archive.pipe(stream);

    for (const inv of invoices) {
      const pdfBytes = await renderInvoicePdf({
        invoice: inv,
        payroll: body.payroll,
        invoiceNumber: makeInvoiceNumber(),
      });

      const safeName = (inv.propertyLabel || inv.propertyKey || "invoice").replace(/[^a-z0-9\-_. ]/gi, "_");
      archive.append(Buffer.from(pdfBytes), { name: `${safeName}.pdf` });
    }

    // ── Master Excel workbook ──
    const xlsBuf = buildMasterExcel(invoices, employees);
    const payDate: string = body.payroll?.payDate ?? "";
    const excelName = `${formatPayDateForFilename(payDate)} Payroll Allocation.xlsx`;
    archive.append(xlsBuf, { name: excelName });

    await archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zipBuf = Buffer.concat(chunks);

    return new NextResponse(zipBuf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=payroll-invoices.zip",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to generate PDFs" }, { status: 400 });
  }
}

function makeInvoiceNumber() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

/** Format payDate (e.g. "01/15/2026") to "01-15-26" for safe filenames */
function formatPayDateForFilename(payDate: string): string {
  if (!payDate) return "Payroll";
  const mdy = payDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${m.padStart(2, "0")}-${d.padStart(2, "0")}-${y.slice(2)}`;
  }
  const dt = new Date(payDate);
  if (!isNaN(dt.getTime())) {
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const yy = String(dt.getFullYear()).slice(2);
    return `${mm}-${dd}-${yy}`;
  }
  return payDate.replace(/[/\\?%*:|"<>]/g, "-");
}

const CURRENCY_FMT = '"$"#,##0.00';

/** Apply currency number format to all numeric cells in a worksheet starting at column index `numStartCol` (0-based). */
function applyCurrencyFormat(ws: XLSX.WorkSheet, totalRows: number, totalCols: number, numStartCol: number) {
  for (let r = 1; r < totalRows; r++) {       // skip header row (row 0 = row 1 in XLSX)
    for (let c = numStartCol; c < totalCols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr] && typeof ws[addr].v === "number") {
        ws[addr].z = CURRENCY_FMT;
      }
    }
  }
}

/** Set column widths. widths is array of character widths per column. */
function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function toTitleCaseXl(s: string): string {
  if (!s) return s;
  return s.toLowerCase().replace(/(?:^|[\s-])(\S)/g, (m) => m.toUpperCase());
}

function buildMasterExcel(invoices: any[], employees: any[]): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Invoices sheet ──
  const invHasSalREC   = invoices.some((r) => (r.salaryREC ?? 0) > 0);
  const invHasSalNR    = invoices.some((r) => (r.salaryNR  ?? 0) > 0);
  const invHasOvertime = invoices.some((r) => (r.overtime  ?? 0) > 0);
  const invHasHolREC   = invoices.some((r) => (r.holREC    ?? 0) > 0);
  const invHasHolNR    = invoices.some((r) => (r.holNR     ?? 0) > 0);
  const invHas401k     = invoices.some((r) => (r.er401k    ?? 0) > 0);
  const invHasOther    = invoices.some((r) => (r.other     ?? 0) > 0);
  const invHasTaxesEr  = invoices.some((r) => (r.taxesEr   ?? 0) > 0);

  const invCols: string[] = ["Property", "Property Name"];
  if (invHasSalREC)   invCols.push("Salary REC");
  if (invHasSalNR)    invCols.push("Salary NR");
  if (invHasOvertime) invCols.push("Overtime");
  if (invHasHolREC)   invCols.push("HOL REC");
  if (invHasHolNR)    invCols.push("HOL NR");
  if (invHas401k)     invCols.push("401K (ER)");
  if (invHasOther)    invCols.push("Other");
  if (invHasTaxesEr)  invCols.push("Taxes (ER)");
  invCols.push("Total");

  const invNumStart = 2;

  const invDataRows = invoices.map((r) => {
    const row: (string | number)[] = [r.propertyCode || r.propertyKey, toTitleCaseXl(r.propertyLabel || r.propertyKey)];
    if (invHasSalREC)   row.push(r.salaryREC ?? 0);
    if (invHasSalNR)    row.push(r.salaryNR  ?? 0);
    if (invHasOvertime) row.push(r.overtime  ?? 0);
    if (invHasHolREC)   row.push(r.holREC    ?? 0);
    if (invHasHolNR)    row.push(r.holNR     ?? 0);
    if (invHas401k)     row.push(r.er401k    ?? 0);
    if (invHasOther)    row.push(r.other     ?? 0);
    if (invHasTaxesEr)  row.push(r.taxesEr   ?? 0);
    row.push(r.total ?? 0);
    return row;
  });

  const invTotalsRow: (string | number)[] = ["Totals", ""];
  for (let ci = invNumStart; ci < invCols.length; ci++) {
    invTotalsRow.push(invDataRows.reduce((s, r) => s + (Number(r[ci]) || 0), 0));
  }

  const invAllRows = [invCols, ...invDataRows, invTotalsRow];
  const invWs = XLSX.utils.aoa_to_sheet(invAllRows);
  applyCurrencyFormat(invWs, invAllRows.length, invCols.length, invNumStart);
  // Column widths: Property code (~10), Property Name (~30), numeric cols (~14 each)
  setColWidths(invWs, [10, 30, ...Array(invCols.length - 2).fill(14)]);
  XLSX.utils.book_append_sheet(wb, invWs, "Invoices");

  // ── Employees sheet ──
  const empHasSalary   = employees.some((e) => (e.salaryAmt   ?? 0) > 0);
  const empHasOvertime = employees.some((e) => (e.overtimeAmt ?? 0) > 0);
  const empHasHol      = employees.some((e) => (e.holAmt      ?? 0) > 0);
  const empHas401k     = employees.some((e) => (e.er401kAmt   ?? 0) > 0);
  const empHasOther    = employees.some((e) => (e.otherAmt    ?? 0) > 0);
  const empHasTaxesEr  = employees.some((e) => (e.taxesErAmt  ?? 0) > 0);

  const empCols: string[] = ["Employee", "REC/NR"];
  if (empHasSalary)   empCols.push("Salary");
  if (empHasOvertime) empCols.push("Overtime");
  if (empHasHol)      empCols.push("HOL");
  if (empHas401k)     empCols.push("401K (ER)");
  if (empHasOther)    empCols.push("Other");
  if (empHasTaxesEr)  empCols.push("Taxes (ER)");
  empCols.push("Total");

  const empNumStart = 2;

  const empDataRows = employees.map((e) => {
    const row: (string | number)[] = [toTitleCaseXl(e.name), e.recoverable ? "REC" : "NR"];
    if (empHasSalary)   row.push(e.salaryAmt   ?? 0);
    if (empHasOvertime) row.push(e.overtimeAmt ?? 0);
    if (empHasHol)      row.push(e.holAmt      ?? 0);
    if (empHas401k)     row.push(e.er401kAmt   ?? 0);
    if (empHasOther)    row.push(e.otherAmt    ?? 0);
    if (empHasTaxesEr)  row.push(e.taxesErAmt  ?? 0);
    row.push(e.total ?? 0);
    return row;
  });

  const empTotalsRow: (string | number)[] = ["Totals", ""];
  for (let ci = empNumStart; ci < empCols.length; ci++) {
    empTotalsRow.push(empDataRows.reduce((s, r) => s + (Number(r[ci]) || 0), 0));
  }

  const empAllRows = [empCols, ...empDataRows, empTotalsRow];
  const empWs = XLSX.utils.aoa_to_sheet(empAllRows);
  applyCurrencyFormat(empWs, empAllRows.length, empCols.length, empNumStart);
  // Column widths: Employee name (~28), REC/NR (~8), numeric cols (~14 each)
  setColWidths(empWs, [28, 8, ...Array(empCols.length - 2).fill(14)]);
  XLSX.utils.book_append_sheet(wb, empWs, "Employees");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
