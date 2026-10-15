import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { buildAllocationTemplateXlsx, type AllocExportEmployee } from "./export";

const employees: AllocExportEmployee[] = [
  { name: "Nancy Reyes", employeeNumber: "101", recoverable: true, allocations: { "2300": 0.6, "9510": 0.4 } },
  { name: "Harry Feldman", employeeNumber: "102", recoverable: false, allocations: { "2300": 0.25, "0800": 0.05 } },
];

async function book(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await buildAllocationTemplateXlsx(employees)).arrayBuffer());
  return wb;
}
const num = (ws: ExcelJS.Worksheet, addr: string) => {
  const v = ws.getCell(addr).value as { formula?: string; result?: number } | number | null;
  if (v !== null && typeof v === "object") return "formula" in v ? v.result : undefined;
  return v;
};
const formula = (ws: ExcelJS.Worksheet, addr: string) => {
  const v = ws.getCell(addr).value as { formula?: string } | null;
  return v && typeof v === "object" && "formula" in v ? v.formula : undefined;
};

describe("the allocation template", () => {
  let wb: ExcelJS.Workbook;
  beforeAll(async () => { wb = await book(); });

  it("keeps both sheets, in order", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Allocations", "Upload Template"]);
  });

  describe("sheet 1 — the one people read", () => {
    it("carries the house look", () => {
      const ws = wb.getWorksheet("Allocations")!;
      expect(String(ws.getCell("A1").value)).toContain("KORMAN");
      // Row 3 is the column-header band.
      expect((ws.getCell("A3").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF0B4A7D");
      expect(ws.getCell("A3").value).toBe("Emp #");
      expect(ws.getCell("B3").value).toBe("Employee Name");
    });

    it("totals each person's row as a live formula", () => {
      // The dashboard's allocation-gap warning is about this figure, so it has
      // to follow an edited percentage rather than sit as a stale number.
      const ws = wb.getWorksheet("Allocations")!;
      const last = ws.getColumn(ws.columnCount).letter;
      expect(formula(ws, `${last}4`)).toMatch(/^SUM\(/);
      expect(num(ws, `${last}4`)).toBeCloseTo(1, 6);
    });

    it("leaves a property the person has no share of genuinely empty", () => {
      // Not 0% — "no allocation" and "allocated zero" are different claims.
      const ws = wb.getWorksheet("Allocations")!;
      const row = ws.getRow(5); // Harry
      const cells = [4, 5, 6].map((c) => row.getCell(c).value);
      expect(cells).toContain(null);
    });

    it("freezes the identifying columns and both header rows", () => {
      const ws = wb.getWorksheet("Allocations")!;
      expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 3, ySplit: 3 });
    });
  });

  describe("sheet 2 — the one a machine reads", () => {
    it("keeps its header on ROW 1, with the exact tokens the parser looks for", () => {
      // `parseAllocationWorkbook` locates its header by finding a row carrying
      // both "EmployeeName" and "Recoverable". Styling this sheet — a title
      // band, a merged group row — would move that row and break the re-import,
      // so it stays a bare grid deliberately.
      const ws = wb.getWorksheet("Upload Template")!;
      expect(ws.getCell("A1").value).toBe("EmployeeID");
      expect(ws.getCell("B1").value).toBe("EmployeeName");
      expect(ws.getCell("C1").value).toBe("Recoverable");
      expect(ws.getCell("B2").value).toBe("Nancy Reyes");
      expect(ws.getCell("C2").value).toBe("REC");
      expect(ws.getCell("C3").value).toBe("NR");
    });

    it("is not given a letterhead or a header fill", () => {
      const ws = wb.getWorksheet("Upload Template")!;
      expect(ws.getCell("A1").fill).toBeUndefined();
    });

    it("writes its percentages as whole numbers, the way the parser reads them", () => {
      const ws = wb.getWorksheet("Upload Template")!;
      // Keys are sorted, so 0800 | 2300 | 9510 → D | E | F.
      expect(ws.getCell("E2").value).toBe(60);
      expect(ws.getCell("F2").value).toBe(40);
    });
  });
});
