import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
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

const sheetOf = (buf: Buffer) => {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.Sheets[wb.SheetNames[0]];
};

describe("one property's rent roll as a workbook", () => {
  const units = [
    unit({ unitRef: "9510-406" }),
    unit({ unitRef: "9510-412", sqft: 2000, baseRent: 7000, opexMonth: 700, reTaxMonth: 350, otherMonth: 140, grossRentTotal: 8190 }),
  ];
  const buf = buildPropertyRollXlsx(prop(units), "Shops at Lafayette Hill", "2026-07-31");
  const ws = sheetOf(buf);

  it("names the sheet within Excel's limits and leads with the code", () => {
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames[0]).toBe("9510 Rent Roll");
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31);
    expect(wb.SheetNames[0]).not.toMatch(/[\\/?*[\]:]/);
  });

  it("says which property and as of when, since it leaves the building", () => {
    expect(ws["A1"].v).toBe("9510 — Shops at Lafayette Hill");
    expect(ws["A2"].v).toBe("Rent roll as of 2026-07-31");
  });

  it("carries the page's columns, in the page's order", () => {
    const headers = ["A4", "B4", "C4", "D4", "E4", "F4", "G4", "H4", "I4", "J4", "K4"].map((a) => ws[a].v);
    expect(headers).toEqual([
      "Tenant", "Unit", "Sq Ft", "Lease From", "Lease To",
      "Ann. $/SF", "Base Rent", "CAM", "INS", "RET", "Gross",
    ]);
  });

  it("writes the TOTAL row as live formulas over the rows above it", () => {
    // Per the export rule: a total that is a static number stops tying the
    // moment somebody edits a line.
    expect(ws["A7"].v).toBe("Total · 2 units");
    expect(ws["C7"].f).toBe("SUM(C5:C6)");  // Sq Ft
    expect(ws["G7"].f).toBe("SUM(G5:G6)");  // Base Rent
    expect(ws["K7"].f).toBe("SUM(K5:K6)");  // Gross
  });

  it("caches each total's value, so the figure shows before Excel recalculates", () => {
    expect(ws["C7"].v).toBe(3000);
    expect(ws["G7"].v).toBe(12000);
    expect(ws["K7"].v).toBe(14040);
  });

  it("does not total a column that cannot be summed", () => {
    // $/SF is a rate; adding two of them produces a number that means nothing.
    expect(ws["F7"]).toBeUndefined();
    // Nor the text columns.
    expect(ws["D7"]).toBeUndefined();
    expect(ws["E7"]).toBeUndefined();
  });

  it("labels a vacant unit rather than leaving its tenant blank", () => {
    const one = sheetOf(buildPropertyRollXlsx(
      prop([unit({ unitRef: "9510-400", isVacant: true, occupantName: "", baseRent: 0, grossRentTotal: 0 })]),
      "Shops at Lafayette Hill", null));
    expect(one["A5"].v).toBe("VACANT");
    expect(one["A2"].v).toBe("Rent roll"); // no date claimed when none is known
  });

  it("survives a property with no units instead of writing a broken total", () => {
    const empty = sheetOf(buildPropertyRollXlsx(prop([]), "Shops at Lafayette Hill", "2026-07-31"));
    expect(empty["A4"].v).toBe("Tenant");
    expect(empty["A5"]).toBeUndefined();
  });
});
