import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { reproject } from "@/lib/financials/reprojections/compute";
import { buildT12Xlsx } from "@/lib/financials/reprojections/reprojExport";
import type { StatementMapping } from "@/lib/financials/operating-statements/types";
import { t12Window, t12Labels, t12Span, stitchMonthly } from "./window";

const mapping: StatementMapping = {
  propertyCode: "TEST", entityName: "Test Center LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [{ label: "Rental income", mask: "4230-*" }] },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [{ label: "Maintenance", mask: "6030-8502" }] },
  ],
};
const m = (v: number) => new Array(12).fill(v);

describe("the T-12 workbook", () => {
  it("heads the twelve trailing months, totals them live, and carries no budget columns", async () => {
    const win = t12Window(2026, 8);
    const glMonthly = stitchMonthly(win, { 2025: { "4230-8501": m(-100) }, 2026: { "4230-8501": m(-120), "6030-8502": m(30) } });
    const r = reproject({ mapping, propertyName: "Test Center", year: 2026, glMonthly, budgetLines: [], actualThroughMonth: 12 });
    const buf = await buildT12Xlsx(r, { propertyCode: "TEST", propertyName: "Test Center", year: 2026, budgetYear: null, t12: { labels: t12Labels(win), span: t12Span(win) } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell(2, 1).value)).toMatch(/^T-12 Actuals/);
    const hdr = ws.getRow(4);
    expect(hdr.getCell(2).value).toBe("Sep 25");
    expect(hdr.getCell(13).value).toBe("Aug 26");
    expect(hdr.getCell(14).value).toBe("T-12");
    expect(hdr.getCell(15).value).toBeFalsy();
    // Rental income: 4 months at 100 + 8 at 120 = 1,360, as a live SUM.
    let rent: ExcelJS.Row | null = null;
    ws.eachRow((row) => { if (row.getCell(1).value === "Rental income") rent = row; });
    const total = rent!.getCell(14).value as { formula: string; result: number };
    expect(total.formula).toBe(`SUM(B${rent!.number}:M${rent!.number})`);
    expect(total.result).toBe(1360);
  });
});
