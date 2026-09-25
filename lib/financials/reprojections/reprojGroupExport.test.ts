import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildReprojGroupXlsx, buildReprojXlsx, type ReprojMeta } from "./reprojExport";
import type { Reprojection } from "./compute";
import { rentRollGroupFor } from "@/lib/financials/operating-statements/propertyGroups";

import { reproject } from "./compute";
import type { StatementMapping } from "@/lib/financials/operating-statements/types";

// The same shape exportSmoke builds from — a real reprojection, so the sheet
// writer is exercised rather than a hand-rolled approximation of its input.
const mapping: StatementMapping = {
  propertyCode: "TEST", entityName: "Test Center LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [{ label: "Rental income", mask: "4230-*" }] },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [{ label: "Maintenance", mask: "6030-8502" }] },
  ],
};
const m = (v: number) => new Array(12).fill(v);
const fixture = (): Reprojection => reproject({
  mapping, propertyName: "Test Center", year: 2026,
  glMonthly: { "4230-8501": m(-100), "6030-8502": m(30) },
  budgetLines: [{ glAccount: "4230-8501", months: m(90) }, { glAccount: "6030-8502", months: m(25) }],
  actualThroughMonth: 3,
});
const meta = (code: string, name: string): ReprojMeta =>
  ({ propertyCode: code, propertyName: name, year: 2026, budgetYear: 2026 });

describe("a group workbook is a sheet per property", () => {
  it("writes one sheet for each, in the order given", async () => {
    const buf = await buildReprojGroupXlsx([
      { r: fixture(), meta: meta("2300", "Brookwood Shopping Center") },
      { r: fixture(), meta: meta("4500", "Gray's Ferry Shopping Center") },
      { r: fixture(), meta: meta("7010", "Parkwood Shopping/Office Center") },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets).toHaveLength(3);
    // Order is the caller's, and each tab leads with its code. The names are
    // truncated to Excel's 31, so the prefix is what is asserted — an exact
    // string here would break on a rename that changes nothing that matters.
    expect(wb.worksheets.map((w) => w.name.slice(0, 4))).toEqual(["2300", "4500", "7010"]);
    expect(wb.worksheets[0].name).toBe("2300 Brookwood Shopping Center");
    // The slash in "Shopping/Office" is illegal in a tab name.
    expect(wb.worksheets[2].name).toContain("Parkwood Shopping Office");
  });

  it("keeps every tab name legal and unique", async () => {
    // Excel forbids \ / ? * [ ] : , caps a name at 31 characters, and THROWS on
    // a duplicate — so a workbook of thirteen buildings cannot trust the data
    // for its tab names.
    const buf = await buildReprojGroupXlsx([
      { r: fixture(), meta: meta("7010", "Parkwood Shopping/Office Center") },
      { r: fixture(), meta: meta("7010", "Parkwood Shopping/Office Center") },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const names = wb.worksheets.map((w) => w.name);
    expect(new Set(names).size).toBe(2);
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[\\/?*[\]:]/);
    }
  });

  it("leads each tab with the CODE, which is what tabs are scanned by", async () => {
    const buf = await buildReprojGroupXlsx([{ r: fixture(), meta: meta("9510", "Shops at Lafayette Hill") }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets[0].name.startsWith("9510")).toBe(true);
  });

  it("uses the SAME sheet layout as the single-property download", async () => {
    // A group workbook that drifts from the one figures are checked against is
    // worse than no group workbook.
    const one = new ExcelJS.Workbook();
    await one.xlsx.load((await buildReprojXlsx(fixture(), meta("2300", "Brookwood"))) as never);
    const many = new ExcelJS.Workbook();
    await many.xlsx.load((await buildReprojGroupXlsx([{ r: fixture(), meta: meta("2300", "Brookwood") }])) as never);
    const cells = (wb: ExcelJS.Workbook) =>
      [1, 2, 3, 4].map((r) => String(wb.worksheets[0].getCell(r, 1).value ?? ""));
    expect(cells(many)).toEqual(cells(one));
  });
});

describe("the groups the menu offers", () => {
  it("are the rent roll's, so a building cannot be in one report and not another", () => {
    expect(rentRollGroupFor("2300")).toBe("Shopping Centers");
    expect(rentRollGroupFor("3610")).toBe("JV III LLC");
    expect(rentRollGroupFor("4050")).toBe("NI LLC");
  });

  it("include the new Butler & Main with the other shopping centers", () => {
    expect(rentRollGroupFor("9000")).toBe("Shopping Centers");
  });
});
