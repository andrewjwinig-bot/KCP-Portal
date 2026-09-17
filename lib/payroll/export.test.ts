import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { buildPayrollExportXlsx, buildPayrollGLXlsx, type PayrollExportInvoice } from "./export";

const invoices: PayrollExportInvoice[] = [
  { propertyKey: "2300", propertyLabel: "Brookwood", propertyCode: "2300",
    salaryREC: 1000, salaryNR: 500, overtime: 100, holREC: 50, holNR: 25,
    er401k: 60, er401kREC: 40, er401kNR: 20, other: 30, otherREC: 20, otherNR: 10,
    taxesEr: 200, taxesErREC: 140, taxesErNR: 60, total: 1965 },
  { propertyKey: "9510", propertyLabel: "Lafayette Hill", propertyCode: "9510",
    salaryREC: 2000, salaryNR: 0, overtime: 0, holREC: 0, holNR: 0,
    er401k: 80, er401kREC: 80, er401kNR: 0, other: 0, otherREC: 0, otherNR: 0,
    taxesEr: 300, taxesErREC: 300, taxesErNR: 0, total: 2380 },
];

const num = (ws: ExcelJS.Worksheet, addr: string) => {
  const v = ws.getCell(addr).value as { formula?: string; result?: number } | number | null;
  if (v !== null && typeof v === "object") return "formula" in v ? v.result : undefined;
  return v;
};
const formula = (ws: ExcelJS.Worksheet, addr: string) => {
  const v = ws.getCell(addr).value as { formula?: string } | null;
  return v && typeof v === "object" && "formula" in v ? v.formula : undefined;
};

describe("the payroll summary — a document people read", () => {
  let ws: ExcelJS.Worksheet;
  // The letterhead is three rows, so the header lands on 4 and the body on 5.
  const HEADER = 4, FIRST = 5, LAST = 6, TOTAL = 7;

  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildPayrollExportXlsx({ payDate: "10/28/2025", invoices })).arrayBuffer());
    ws = wb.worksheets[0];
  });

  it("says what it is and which pay date, since it rides an email to three people", () => {
    expect(String(ws.getCell("A1").value)).toContain("KORMAN");
    expect(String(ws.getCell("A3").value)).toContain("Payroll Allocation Summary");
    expect(String(ws.getCell("A3").value)).toContain("Pay date 10/28/2025");
  });

  it("carries the house header band and accounting money format", () => {
    expect((ws.getCell(`A${HEADER}`).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF0B4A7D");
    expect(ws.getCell(`C${FIRST}`).numFmt).toContain("[Red]");
  });

  it("makes each row's Total a live SUM of its own components", () => {
    expect(formula(ws, `K${FIRST}`)).toBe(`SUM(C${FIRST}:J${FIRST})`);
    expect(num(ws, `K${FIRST}`)).toBe(1965);
  });

  it("makes the bottom Total row live down each column", () => {
    expect(formula(ws, `C${TOTAL}`)).toBe(`SUM(C${FIRST}:C${LAST})`);
    expect(num(ws, `C${TOTAL}`)).toBe(3000);
    expect(num(ws, `K${TOTAL}`)).toBe(4345);
  });

  it("falls back to a static Total on a row that does not reconcile", () => {
    // A displayed value is never wrong; at worst it stops being editable.
    const odd = [{ ...invoices[0], total: 9999 }];
    return (async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await (await buildPayrollExportXlsx({ payDate: null, invoices: odd })).arrayBuffer());
      const w = wb.worksheets[0];
      expect(formula(w, `K${FIRST}`)).toBeUndefined();
      expect(num(w, `K${FIRST}`)).toBe(9999);
    })();
  });
});

describe("the GL journal entry — a machine import, deliberately unthemed", () => {
  // No header row, no title, data from row 1, positional columns. A letterhead
  // would shift every row and break the import on its first line. This test
  // exists so a later migration pass does not "finish the job" and break it.
  it("starts its data on row 1 with no letterhead", async () => {
    const blob = buildPayrollGLXlsx({ payDate: "10/28/2025", invoices });
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws["A1"].v).toBe("JRNL");
    expect(ws["B1"].v).toBe("2000");
    expect(ws["C1"].v).toBe("8080-0000");
  });

  it("keeps the offset row a live =-SUM so column H nets to $0", async () => {
    const blob = buildPayrollGLXlsx({ payDate: "10/28/2025", invoices });
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // 2300 contributes an NR and a REC line; 9510 only a REC line.
    expect(ws["C4"].v).toBe("0110-0000");
    expect(ws["H4"].f).toBe("-SUM(H1:H3)");
  });
});
