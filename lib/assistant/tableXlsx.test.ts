import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
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

const sheetOf = (buf: ArrayBuffer) => {
  const wb = XLSX.read(buf, { type: "array" });
  return wb.Sheets[wb.SheetNames[0]];
};

describe("the assistant's table as a workbook", () => {
  const ws = sheetOf(buildTableXlsx(spec));

  it("leads with the title and the basis, because it leaves the building", () => {
    expect(ws["A1"].v).toBe(spec.title);
    expect(ws["A2"].v).toBe(spec.subtitle);
  });

  it("writes the header and rows where the reader expects them", () => {
    expect(["A4", "B4", "C4", "D4"].map((a) => ws[a].v)).toEqual(["Property", "2025 Salaries", "2025 NOI", "2025 % of NOI"]);
    expect(ws["A5"].v).toBe("2300 Brookwood");
    expect(ws["B6"].v).toBe(90_000);
  });

  it("totals money columns as live formulas with cached values", () => {
    expect(ws["A7"].v).toBe("Total · 2 rows");
    expect(ws["B7"].f).toBe("SUM(B5:B6)");
    expect(ws["B7"].v).toBe(115_000);
    expect(ws["C7"].f).toBe("SUM(C5:C6)");
    expect(ws["C7"].v).toBe(850_000);
  });

  it("RECOMPUTES a ratio total instead of summing the percentage column", () => {
    // 10% + 15% is 25%, which is not the portfolio's ratio. 115k ÷ 850k is.
    expect(ws["D7"].f).toBe('IFERROR(B7/C7*100,"")');
    expect(ws["D7"].v).toBeCloseTo(13.53, 2);
    expect(ws["D7"].v).not.toBe(25);
  });

  it("guards the ratio against a zero denominator", () => {
    // A portfolio at break-even is a real shape; #DIV/0! in a sent workbook
    // reads as a broken file rather than as "not meaningful".
    const zero = sheetOf(buildTableXlsx({ ...spec, rows: [{ property: "X", salaries: 10, noi: 0, pct: null }] }));
    expect(zero["D6"].f).toContain("IFERROR");
    expect(zero["D6"].v).toBe(0);
  });

  it("treats a blank as 'no such line', not as zero", () => {
    // SUM skips blanks, so a property with no matching line does not drag the
    // total — and it is not written as a 0 that reads as real spend.
    const withGap = sheetOf(buildTableXlsx({
      ...spec,
      rows: [{ property: "A", salaries: null, noi: 100_000, pct: null }, { property: "B", salaries: 40_000, noi: 100_000, pct: 40 }],
    }));
    expect(withGap["B5"]).toBeUndefined();
    expect(withGap["B7"].f).toBe("SUM(B5:B6)");
    expect(withGap["B7"].v).toBe(40_000);
  });

  it("never totals a text column", () => {
    expect(ws["A7"].f).toBeUndefined();
  });

  it("prints the notes below the grid, where what-was-counted belongs", () => {
    expect(ws["A9"].v).toBe("Counted: Management Salaries, Leasing Salaries.");
  });

  it("survives a table with no rows rather than writing a broken total", () => {
    const empty = sheetOf(buildTableXlsx({ ...spec, rows: [] }));
    expect(empty["A4"].v).toBe("Property");
    expect(empty["A5"]).toBeUndefined();
  });

  it("makes a sheet name Excel will accept", () => {
    expect(sheetName(spec.title).length).toBeLessThanOrEqual(31);
    expect(sheetName("A/B?C*D[E]F:G")).not.toMatch(/[\\/?*[\]:]/);
    expect(sheetName("")).toBe("Table");
  });
});
