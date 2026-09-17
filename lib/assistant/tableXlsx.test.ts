import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { buildTableXlsx, sheetName, type TableSpec } from "./tableXlsx";

const spec: TableSpec = {
  title: "Non-reimbursable management & leasing salaries vs NOI",
  subtitle: "YTD through period 12 · from the imported GL",
  columns: [
    { key: "property", label: "Property", format: "text" },
    { key: "salaries", label: "2025 Salaries", format: "money" },
    { key: "noi", label: "2025 NOI", format: "money" },
    { key: "pct", label: "2025 % of NOI", format: "percent", ratioOf: { numerator: "salaries", denominator: "noi" } },
  ],
  rows: [
    { property: "2300 Brookwood", salaries: 25_000, noi: 250_000, pct: 10 },
    { property: "4500 Gray's Ferry", salaries: 90_000, noi: 600_000, pct: 15 },
  ],
  notes: ["Counted: Management Salaries, Leasing Salaries."],
};

// Read the workbook back the way Excel would, so the assertions are about the
// FILE rather than about the builder's own bookkeeping.
async function sheetOf(buf: ArrayBuffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}
const val = (ws: ExcelJS.Worksheet, addr: string) => ws.getCell(addr).value;
/** A formula cell's expression, or undefined when the cell holds a plain value. */
const formula = (ws: ExcelJS.Worksheet, addr: string) => {
  const v = ws.getCell(addr).value as { formula?: string } | null;
  return v && typeof v === "object" && "formula" in v ? v.formula : undefined;
};
/** A cell's number, whether it is static or the cached result of a formula.
 *  A formula whose cached result ExcelJS dropped reads as undefined. */
const num = (ws: ExcelJS.Worksheet, addr: string) => {
  const v = ws.getCell(addr).value as { formula?: string; result?: number } | number | null;
  if (v !== null && typeof v === "object") return "formula" in v ? v.result : undefined;
  return v;
};

// The letterhead is three rows, so the header lands on 4 and the body on 5.
const HEADER = 4, FIRST = 5, LAST = 6, TOTAL = 7;

describe("the assistant's table as a workbook", () => {
  let ws: ExcelJS.Worksheet;
  beforeAll(async () => { ws = await sheetOf(await buildTableXlsx(spec)); });

  it("leads with the title and the basis, because it leaves the building", () => {
    expect(val(ws, "A2")).toBe(spec.title);
    expect(String(val(ws, "A3"))).toContain(spec.subtitle!);
  });

  it("writes the header and rows where the reader expects them", () => {
    expect(["A", "B", "C", "D"].map((c) => val(ws, `${c}${HEADER}`)))
      .toEqual(["Property", "2025 Salaries", "2025 NOI", "2025 % of NOI"]);
    expect(val(ws, `A${FIRST}`)).toBe("2300 Brookwood");
    expect(val(ws, `B${LAST}`)).toBe(90_000);
  });

  it("totals money columns as live formulas with cached values", () => {
    expect(val(ws, `A${TOTAL}`)).toBe("Total · 2 rows");
    expect(formula(ws, `B${TOTAL}`)).toBe(`SUM(B${FIRST}:B${LAST})`);
    expect(num(ws, `B${TOTAL}`)).toBe(115_000);
    expect(formula(ws, `C${TOTAL}`)).toBe(`SUM(C${FIRST}:C${LAST})`);
    expect(num(ws, `C${TOTAL}`)).toBe(850_000);
  });

  it("RECOMPUTES a ratio total instead of summing the percentage column", () => {
    // 10% + 15% is 25%, which is not the portfolio's ratio. 115k ÷ 850k is.
    expect(formula(ws, `D${TOTAL}`)).toBe(`IFERROR(B${TOTAL}/C${TOTAL}*100,"")`);
    expect(num(ws, `D${TOTAL}`)).toBeCloseTo(13.53, 2);
    expect(num(ws, `D${TOTAL}`)).not.toBe(25);
  });

  it("guards the ratio against a zero denominator", async () => {
    // A portfolio at break-even is a real shape; #DIV/0! in a sent workbook
    // reads as a broken file rather than as "not meaningful".
    const zero = await sheetOf(await buildTableXlsx({ ...spec, rows: [{ property: "X", salaries: 10, noi: 0, pct: null }] }));
    expect(formula(zero, `D${FIRST + 1}`)).toContain("IFERROR");
    // The cached 0 does NOT survive the write — ExcelJS drops a `result: 0` —
    // which is exactly the case `newWorkbook()`'s fullCalcOnLoad covers: Excel
    // recalculates on open and the cell reads blank rather than #DIV/0!.
    expect(num(zero, `D${FIRST + 1}`)).toBeUndefined();
  });

  it("treats a blank as 'no such line', not as zero", async () => {
    // SUM skips blanks, so a property with no matching line does not drag the
    // total — and it is not written as a 0 that reads as real spend.
    const withGap = await sheetOf(await buildTableXlsx({
      ...spec,
      rows: [{ property: "A", salaries: null, noi: 100_000, pct: null }, { property: "B", salaries: 40_000, noi: 100_000, pct: 40 }],
    }));
    expect(val(withGap, `B${FIRST}`)).toBeNull();
    expect(formula(withGap, `B${TOTAL}`)).toBe(`SUM(B${FIRST}:B${LAST})`);
    expect(num(withGap, `B${TOTAL}`)).toBe(40_000);
  });

  it("never totals a text column", () => {
    expect(formula(ws, `A${TOTAL}`)).toBeUndefined();
  });

  it("prints the notes below the grid, where what-was-counted belongs", () => {
    expect(val(ws, `A${TOTAL + 2}`)).toBe("Counted: Management Salaries, Leasing Salaries.");
  });

  it("carries the house look, so it matches the statements it was derived from", () => {
    expect((ws.getCell(`A${HEADER}`).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF0B4A7D");
    expect(ws.getCell(`B${FIRST}`).numFmt).toContain("[Red]");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: HEADER });
  });

  it("survives a table with no rows rather than writing a broken total", async () => {
    const empty = await sheetOf(await buildTableXlsx({ ...spec, rows: [] }));
    expect(val(empty, `A${HEADER}`)).toBe("Property");
    expect(val(empty, `A${FIRST}`)).toBeNull();
  });

  it("makes a sheet name Excel will accept", () => {
    expect(sheetName(spec.title).length).toBeLessThanOrEqual(31);
    expect(sheetName("A/B?C*D[E]F:G")).not.toMatch(/[\\/?*[\]:]/);
    expect(sheetName("")).toBe("Table");
  });
});
