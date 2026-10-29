import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { newWorkbook, liveFormula, liveSum, liveAdd, titleBlock, FMT, COLOR } from "./theme";

describe("newWorkbook", () => {
  it("sets fullCalcOnLoad, so a total that nets to zero is not blank", async () => {
    // ExcelJS drops a cached `result: 0` when it writes a formula cell, so
    // without the recalc flag the one cell meant to read zero — a proof row, a
    // GL offset that must net to $0 — opens empty. This is the whole reason the
    // flag belongs to the constructor rather than to whoever remembers.
    const wb = newWorkbook();
    expect(wb.calcProperties.fullCalcOnLoad).toBe(true);

    const ws = wb.addWorksheet("t");
    ws.getCell("A1").value = 5;
    ws.getCell("A2").value = -5;
    ws.getCell("A3").value = { formula: "SUM(A1:A2)", result: 0 };
    const buf = await wb.xlsx.writeBuffer();

    // Round-trip: the cached zero is indeed gone, and only the recalc flag
    // brings the value back when the file is opened.
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const cell = back.getWorksheet("t")!.getCell("A3").value as { formula?: string; result?: number };
    expect(cell.formula).toBe("SUM(A1:A2)");
    expect(cell.result).toBeUndefined();
  });

  it("stamps one creator across every workbook", () => {
    expect(newWorkbook().creator).toBe("Korman Commercial Properties");
  });
});

describe("liveFormula", () => {
  it("writes the formula with a cached result when it reconciles", () => {
    expect(liveFormula("SUM(C1:C3)", 300, 300)).toEqual({ formula: "SUM(C1:C3)", result: 300 });
  });

  it("falls back to the static number when the formula would disagree", () => {
    // A displayed value is never wrong; at worst it stops being editable.
    expect(liveFormula("SUM(C1:C3)", 300, 250)).toBe(300);
  });

  it("tolerates rounding, not a real gap", () => {
    expect(liveFormula("SUM(C1:C3)", 300, 300.4)).toEqual({ formula: "SUM(C1:C3)", result: 300 });
    expect(liveFormula("SUM(C1:C3)", 300, 300.6)).toBe(300);
  });

  it("falls back on a non-finite input rather than writing NaN", () => {
    expect(liveFormula("SUM(C1:C3)", 300, NaN)).toBe(300);
    expect(liveFormula("", 300, 300)).toBe(300);
  });
});

describe("liveSum / liveAdd", () => {
  it("sums a range that reconciles", () => {
    expect(liveSum("C5:C7", 60, [10, 20, 30])).toEqual({ formula: "SUM(C5:C7)", result: 60 });
  });

  it("refuses a range that does not", () => {
    expect(liveSum("C5:C7", 60, [10, 20])).toBe(60);
  });

  it("adds named cells for a total over SUBTOTALS", () => {
    // Summing the line items again instead would double-count — the trap the
    // 1099 register and the balance sheet both document.
    expect(liveAdd(["C5", "C9"], 60, [25, 35])).toEqual({ formula: "C5+C9", result: 60 });
  });

  it("refuses when the cells and the figures behind them disagree in length", () => {
    expect(liveAdd(["C5", "C9"], 60, [60])).toBe(60);
  });

  it("returns the static total rather than an empty formula", () => {
    expect(liveSum("C5:C7", 60, [])).toBe(60);
    expect(liveAdd([], 60, [])).toBe(60);
  });
});

describe("titleBlock", () => {
  it("says what the document is and what it is about, and returns the next row", () => {
    const ws = newWorkbook().addWorksheet("t");
    const next = titleBlock(ws, {
      entity: "Brookwood Shopping Center LP",
      document: "Balance Sheet",
      subtitle: "2300 Brookwood",
      asOf: "As of September 30, 2026",
      meta: ["EIN 12-3456789", null, "  "],
      width: 4,
    });
    expect(ws.getCell("A1").value).toContain("KORMAN");
    expect(ws.getCell("A2").value).toBe("Brookwood Shopping Center LP");
    expect(String(ws.getCell("A3").value)).toContain("Balance Sheet");
    expect(String(ws.getCell("A3").value)).toContain("As of September 30, 2026");
    expect(ws.getCell("A4").value).toBe("EIN 12-3456789"); // blanks pruned
    expect(next).toBe(5);
  });

  it("does not repeat the entity as its own subtitle", () => {
    const ws = newWorkbook().addWorksheet("t");
    titleBlock(ws, { entity: "LIK Management", document: "Balance Sheet", subtitle: "LIK Management", width: 3 });
    expect(String(ws.getCell("A3").value)).toBe("Balance Sheet");
  });

  it("skips the meta row entirely when there is nothing to say", () => {
    const ws = newWorkbook().addWorksheet("t");
    expect(titleBlock(ws, { entity: "E", document: "D", width: 2 })).toBe(4);
  });
});

describe("tokens", () => {
  it("formats money the accounting way — red parens, em-dash zero", () => {
    expect(FMT.money).toContain("[Red]");
    expect(FMT.money).toContain("—");
  });

  it("keeps one brand navy", () => {
    expect(COLOR.brand).toBe("FF0B4A7D");
  });
});
