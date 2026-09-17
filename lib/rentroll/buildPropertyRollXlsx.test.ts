import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { buildPropertyRollXlsx } from "./buildPropertyRollXlsx";
import type { RentRollProperty, RentRollUnit } from "./parseRentRollExcel";

const unit = (o: Partial<RentRollUnit> & { unitRef: string }): RentRollUnit => ({
  occupantName: "Acme Corp", isVacant: false, propertyCode: "9510", sqft: 1000,
  leaseFrom: "01/01/2020", leaseTo: "12/31/2030", baseRent: 5000, annualRent: 60000,
  annualRentPerSqft: 60, lastIncreaseDate: null, lastIncreaseAmount: 0,
  opexMonth: 500, opexPerSqft: 6, reTaxMonth: 250, reTaxPerSqft: 3,
  otherMonth: 100, otherPerSqft: 1.2, grossRentTotal: 5850, grossRentPerSqft: 70.2,
  futureEscalations: [], ...o,
});

const prop = (units: RentRollUnit[]): RentRollProperty => ({
  propertyCode: "9510", reportedPropertyName: "Shops at Lafayette Hill",
  totalSqft: units.reduce((s, u) => s + u.sqft, 0),
  occupiedSqft: units.filter((u) => !u.isVacant).reduce((s, u) => s + u.sqft, 0),
  vacantSqft: units.filter((u) => u.isVacant).reduce((s, u) => s + u.sqft, 0),
  units,
});

// Read the workbook back the way Excel would, so the assertions are about the
// FILE rather than about the builder's own bookkeeping.
async function bookOf(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}
async function sheetOf(buf: Buffer) {
  return (await bookOf(buf)).worksheets[0];
}
type Cell = { value: unknown };
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

describe("one property's rent roll as a workbook", () => {
  const units = [
    unit({ unitRef: "9510-406" }),
    unit({ unitRef: "9510-412", sqft: 2000, baseRent: 7000, opexMonth: 700, reTaxMonth: 350, otherMonth: 140, grossRentTotal: 8190 }),
  ];
  // The letterhead is three rows (wordmark, entity, document · as-of), so the
  // column headers land on row 4 and the first tenant on row 5.
  const HEADER = 4, FIRST = 5, LAST = 6, TOTAL = 7;

  let ws: ExcelJS.Worksheet;
  let wb: ExcelJS.Workbook;
  beforeAll(async () => {
    const buf = await buildPropertyRollXlsx(prop(units), "Shops at Lafayette Hill", "2026-07-31");
    wb = await bookOf(buf);
    ws = wb.worksheets[0];
  });

  it("names the sheet within Excel's limits and leads with the code", () => {
    expect(ws.name).toBe("9510 Rent Roll");
    expect(ws.name.length).toBeLessThanOrEqual(31);
    expect(ws.name).not.toMatch(/[\\/?*[\]:]/);
  });

  it("says which property and as of when, since it leaves the building", () => {
    expect(String(val(ws, "A1"))).toContain("KORMAN");
    expect(val(ws, "A2")).toBe("9510 — Shops at Lafayette Hill");
    expect(String(val(ws, "A3"))).toContain("Rent Roll");
    expect(String(val(ws, "A3"))).toContain("As of 2026-07-31");
  });

  it("carries the page's columns, in the page's order", () => {
    const headers = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((c) => val(ws, `${c}${HEADER}`));
    expect(headers).toEqual([
      "Tenant", "Unit", "Sq Ft", "Lease From", "Lease To",
      "Ann. $/SF", "Base Rent", "CAM", "INS", "RET", "Gross",
    ]);
  });

  it("writes the TOTAL row as live formulas over the rows above it", () => {
    // Per the export rule: a total that is a static number stops tying the
    // moment somebody edits a line.
    expect(val(ws, `A${TOTAL}`)).toBe("Total · 2 units");
    expect(formula(ws, `C${TOTAL}`)).toBe(`SUM(C${FIRST}:C${LAST})`);  // Sq Ft
    expect(formula(ws, `G${TOTAL}`)).toBe(`SUM(G${FIRST}:G${LAST})`);  // Base Rent
    expect(formula(ws, `K${TOTAL}`)).toBe(`SUM(K${FIRST}:K${LAST})`);  // Gross
  });

  it("caches each total's value, so the figure shows before Excel recalculates", () => {
    expect(num(ws, `C${TOTAL}`)).toBe(3000);
    expect(num(ws, `G${TOTAL}`)).toBe(12000);
    expect(num(ws, `K${TOTAL}`)).toBe(14040);
  });

  it("does not total a column that cannot be summed", () => {
    // $/SF is a rate; adding two of them produces a number that means nothing.
    expect(num(ws, `F${TOTAL}`)).toBeNull();
    // Nor the text columns.
    expect(num(ws, `D${TOTAL}`)).toBeNull();
    expect(num(ws, `E${TOTAL}`)).toBeNull();
  });

  it("carries the house look, so it matches the statements in the same package", () => {
    // The whole reason for the migration: on SheetJS community edition none of
    // this was expressible, so the lender's rent roll was a bare grid beside a
    // branded balance sheet.
    // `fullCalcOnLoad` is deliberately NOT asserted here: ExcelJS WRITES
    // `calcPr` but does not parse it back, so a round-trip cannot see it. It is
    // pinned in theme.test.ts, and against raw XML in the balance sheet's
    // exportSmoke.test.ts.
    expect((ws.getCell(`A${HEADER}`).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF0B4A7D");
    expect(ws.getCell(`G${FIRST}`).numFmt).toContain("[Red]");
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.printTitlesRow).toBe(`${HEADER}:${HEADER}`);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: HEADER });
  });

  it("labels a vacant unit rather than leaving its tenant blank", async () => {
    const one = await sheetOf(await buildPropertyRollXlsx(
      prop([unit({ unitRef: "9510-400", isVacant: true, occupantName: "", baseRent: 0, grossRentTotal: 0 })]),
      "Shops at Lafayette Hill", null));
    expect(val(one, `A${FIRST}`)).toBe("VACANT");
    // No date is claimed when none is known.
    expect(String(val(one, "A3"))).toBe("Rent Roll");
  });

  it("survives a property with no units instead of writing a broken total", async () => {
    const empty = await sheetOf(await buildPropertyRollXlsx(prop([]), "Shops at Lafayette Hill", "2026-07-31"));
    expect(val(empty, `A${HEADER}`)).toBe("Tenant");
    expect(val(empty, `A${FIRST}`)).toBeNull();
  });
});
