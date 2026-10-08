import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseMonthlyPnlWorkbook, inferFromFilename, isPropertySheet } from "./parse";

// Build a minimal workbook matching the by-month template: month header at col D,
// Total at col P (15), Annual at col R (17).
function makeWorkbook(kindLabel: "Actual" | "Budget", titleYear: string): ArrayBuffer {
  const m = (v: number) => Array(12).fill(v);
  const row = (a: any, b: any, c: any, monthly: number[] | null, total: number | null, annual: number | null) => {
    const r: any[] = [a ?? null, b ?? null, c ?? null];
    for (let i = 0; i < 12; i++) r[3 + i] = monthly ? monthly[i] : null;
    r[15] = total ?? null; r[16] = null; r[17] = annual ?? null;
    return r;
  };
  const aoa: any[][] = [
    ["9999"],
    [],
    [null, null, null, titleYear],
    [null, null, null, "9 Test Building"],
    [],
    [null, null, null, "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total", null, "Annual"],
    [null, null, null, ...Array(12).fill(kindLabel), null, null, "Budget"],
    [],
    [null, "Revenues"],
    row("4230-*", null, "Rental income", m(100), 1200, 1300),
    row(null, null, "Total Revenue and Other", m(100), 1200, 1300),
    [null, "Reimbursements"],
    row("4710-*", null, "Electric", m(10), 120, 130),
    row(null, null, "Total Reimbursements", m(10), 120, 130),
    row(null, "Total Revenues", null, m(110), 1320, 1430),
    [null, "Reimbursable Expenses"],
    row("6120-8502", null, "Electric", m(20), 240, 250),
    row(null, null, "Total Reimbursable Expenses", m(20), 240, 250),
    [null, "Non-Reimbursable Expenses"],
    row("8*-*", null, "G&A", m(5), 60, 60),
    row(null, null, "Total Non-Reimbursable Expenses", m(5), 60, 60),
    row(null, "Total Operating Expenses", null, m(25), 300, 310),
    row(null, "Net Operating Income", null, m(85), 1020, 1120),
    row("1440-0000", null, "Tenant improvements", m(3), 36, 0),
    [null, "Debt Service"],
    row("9210-*", null, "Interest", m(40), 480, 0),
    row(null, null, "Total Debt Service", m(40), 480, 0),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "9999");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

describe("monthly-pnl parse", () => {
  it("isPropertySheet matches building codes only", () => {
    expect(isPropertySheet("3640")).toBe(true);
    expect(isPropertySheet("40A0")).toBe(true);
    expect(isPropertySheet("Summary-1,2,4")).toBe(false);
    expect(isPropertySheet("Parameters")).toBe(false);
  });

  it("parses an actual workbook: sections, subtotals, NOI identity", () => {
    const buf = makeWorkbook("Actual", "2024 Actual through 12");
    const [s] = parseMonthlyPnlWorkbook(buf, { fund: "Test Fund" });
    expect(s.propertyCode).toBe("9999");
    expect(s.kind).toBe("actual");
    expect(s.year).toBe(2024);
    expect(s.fund).toBe("Test Fund");
    expect(s.subtotals.totalRevenues!.total).toBe(1320);
    expect(s.subtotals.totalOperatingExpenses!.total).toBe(300);
    expect(s.subtotals.netOperatingIncome!.total).toBe(1020);
    // identity holds every month
    for (let m = 0; m < 12; m++) {
      expect(s.subtotals.totalRevenues!.monthly[m] - s.subtotals.totalOperatingExpenses!.monthly[m]).toBe(s.subtotals.netOperatingIncome!.monthly[m]);
    }
    // line classification + below-noi section
    expect(s.lines.find((l) => l.label === "Rental income")!.section).toBe("revenues");
    expect(s.lines.find((l) => l.label === "Tenant improvements")!.section).toBe("below-noi");
    expect(s.lines.find((l) => l.label === "Interest")!.section).toBe("debt service");
    expect(s.subtotals.totalDebtService!.total).toBe(480);
    // annual budget captured from the workbook's Annual column
    expect(s.lines.find((l) => l.label === "Rental income")!.annualBudget).toBe(1300);
  });

  it("detects budget kind and uses fallback year", () => {
    const buf = makeWorkbook("Budget", "9 Test Building"); // no year in title
    const [s] = parseMonthlyPnlWorkbook(buf, { fallbackYear: 2025 });
    expect(s.kind).toBe("budget");
    expect(s.year).toBe(2025);
  });

  it("inferFromFilename reads year, kind, fund", () => {
    expect(inferFromFilename("2024.12_Actual_by_Month__JVIII.xlsm")).toEqual({ year: 2024, kind: "actual", fund: "JV III" });
    expect(inferFromFilename("2025_Budget__NILLC_Values1.xlsm")).toEqual({ year: 2025, kind: "budget", fund: "NI LLC" });
  });
});
