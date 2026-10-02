import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildFullYearXlsx } from "./statementExport";
import type { FullYearPayload } from "./fullYear";

const m = (v: number) => Array(12).fill(v);
const payload: FullYearPayload = {
  sections: [
    { name: "Rental", role: "revenue", lines: [
      { label: "Rental income", mask: "", accounts: [], monthly: m(100), total: 1200, budget: null, variance: null },
      { label: "Miscellaneous", mask: "", accounts: [], monthly: m(5), total: 60, budget: null, variance: null },
    ], subtotalMonthly: m(105), subtotalTotal: 1260, subtotalBudget: null, subtotalVariance: null },
    { name: "Utilities", role: "reimbursable-expense", lines: [
      { label: "Electric", mask: "", accounts: [], monthly: m(30), total: 360, budget: null, variance: null },
    ], subtotalMonthly: m(30), subtotalTotal: 360, subtotalBudget: null, subtotalVariance: null },
  ],
  rollups: {
    totalRevenues: { monthly: m(105), total: 1260, budget: null, variance: null },
    totalOperatingExpenses: { monthly: m(30), total: 360, budget: null, variance: null },
    netOperatingIncome: { monthly: m(75), total: 900, budget: null, variance: null },
    cashFlowBeforeDebtService: { monthly: m(75), total: 900, budget: null, variance: null },
    totalDebtService: { monthly: m(0), total: 0, budget: null, variance: null },
    cashFlowAfterDebtService: { monthly: m(75), total: 900, budget: null, variance: null },
  },
};

describe("buildFullYearXlsx", () => {
  it("emits a 12-month grid with formula-driven totals", async () => {
    const buf = await buildFullYearXlsx(payload, { propertyCode: "4080", propertyName: "Building 8", year: 2025, label: "Full Year" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(1)!;

    // Header (row 4): Line | Jan..Dec | Full Year 25
    expect(ws.getRow(4).getCell(1).value).toBe("Line");
    expect(ws.getRow(4).getCell(2).value).toBe("Jan");
    expect(ws.getRow(4).getCell(13).value).toBe("Dec");
    expect(String(ws.getRow(4).getCell(14).value)).toContain("Full Year");

    // Locate key rows.
    let lineRow = 0, subRow = 0, noiRow = 0;
    ws.eachRow((r, n) => {
      const v = r.getCell(1).value;
      if (v === "Rental income") lineRow = n;
      if (v === "Total Revenue and Other") subRow = n;
      if (v === "Net Operating Income") noiRow = n;
    });
    expect(lineRow).toBeGreaterThan(0);
    expect(subRow).toBeGreaterThan(lineRow);
    expect(noiRow).toBeGreaterThan(0);

    // Line: months are static values, Full-Year is =SUM(Jan:Dec).
    expect(ws.getRow(lineRow).getCell(2).value).toBe(100);
    expect((ws.getRow(lineRow).getCell(14).value as any).formula).toBe(`SUM(B${lineRow}:M${lineRow})`);

    // Subtotal: each month is =SUM(its section's line rows); Full-Year =SUM(Jan:Dec).
    const subJan = ws.getRow(subRow).getCell(2).value as any;
    expect(subJan.formula).toMatch(/^SUM\(B\d+:B\d+\)$/);
    expect((ws.getRow(subRow).getCell(14).value as any).formula).toBe(`SUM(B${subRow}:M${subRow})`);

    // Rollup Full-Year is a SUM formula too.
    expect((ws.getRow(noiRow).getCell(14).value as any).formula).toBe(`SUM(B${noiRow}:M${noiRow})`);
  });
});
