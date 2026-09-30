import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { newWorkbook } from "@/lib/excel/theme";
import {
  readSov, matchLocation, planFill, applyFill, seedableFacts, portalFactsFor, headerKey, cellValueFor,
} from "./sov";

// A form in the broker's shape: two title rows, a header on row 5, formulas
// for Price per SF / Total and a totals row — and a second tab.
async function brokerForm(): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Property");
  ws.getCell("B1").value = "LIK Management ";
  ws.getCell("B2").value = "Property Statement of Values";
  const headers = ["Location ID", "Location Name", "Address (full street address)", "City", "Construction Description",
    "Occupancy Description", "Year Built", "# of Stories", "Sprinklered", "Units", "Floor Area", "Price Per Square Ft",
    "Building", "BI Values", "Total", "% Sprinklered", "Notes"];
  headers.forEach((h, i) => { ws.getRow(5).getCell(i + 2).value = h; });
  const rows = [
    ["", "Grays Ferry Partners Lp", "2815 Grays Ferry Ave.", "Philadelphia", "Masonry", "Mercantile", 1989, 1, "Yes", 11, 82305, null, 16017184, 2279587.8, null, 1, "keep me"],
    ["", "Trust #4", "2811 Cottman Avenue (Four Seasons)", "Philadelphia", "Masonry", "Mercantile", "1948-50", 1, "No", 1, 5000, null, 875000, 266040, null, null, ""],
    ["", "Trust #4", "2801 Cottman Avenue (McDonald's)", "Philadelphia", "Masonry", "Mercantile", "@ 1970", 1, "None", 1, 5000, null, 0, 231888, null, null, ""],
    ["", "Someone New LLC", "1 Nowhere Lane", "Anytown", "Frame", "Office", 2001, 1, "No", 1, 1000, null, 100, 10, null, null, ""],
  ];
  rows.forEach((vals, i) => {
    const r = 6 + i;
    vals.forEach((v, c) => { if (v !== null && v !== "") ws.getRow(r).getCell(c + 2).value = v as ExcelJS.CellValue; });
    ws.getCell(`M${r}`).value = { formula: `N${r}/L${r}`, result: 0 } as ExcelJS.CellFormulaValue;
    ws.getCell(`P${r}`).value = { formula: `SUM(N${r}:O${r})`, result: 1 } as ExcelJS.CellFormulaValue;
  });
  ws.getCell("P11").value = { formula: "SUM(P6:P10)", result: 999 } as ExcelJS.CellFormulaValue;
  wb.addWorksheet("Vacant Land").getCell("B4").value = "Land Owner";
  // Round-trip, so the test reads what a real file reads.
  const out = newWorkbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  return out;
}

describe("insurance SOV", () => {
  it("tells '% Sprinklered' from 'Sprinklered' and reads the form's typo", () => {
    expect(headerKey("Sprinklered")).toBe("sprinklered");
    expect(headerKey("% Sprinklered")).toBe("pctSprinklered");
    expect(headerKey("Signange")).toBe("signage");
    expect(headerKey("# of Stories")).toBe("stories");
  });

  it("reads the header, every location and the totals row", async () => {
    const sov = readSov(await brokerForm())!;
    expect(sov.sheetName).toBe("Property");
    expect(sov.headerRow).toBe(5);
    expect(sov.rows.map((r) => r.row)).toEqual([6, 7, 8, 9]);
    expect(sov.totalInsuredValue).toBe(999);
    expect(sov.otherSheets).toEqual(["Vacant Land"]);
  });

  it("matches locations explicitly and leaves a stranger unmatched", () => {
    expect(matchLocation({ locationName: "OFFICE WORKS PARTNERSHIP", address: "Five Neshaminy Interplex" })).toBe("4900");
    expect(matchLocation({ locationName: "NESHAMINY INTERPLEX, LLC", address: "Five Neshaminy Interplex" })).toBe("4050");
    expect(matchLocation({ locationName: "x", address: "12300-40 Academy Road" })).toBe("1100");
    expect(matchLocation({ locationName: "x", address: "12301-75 Academy Road" })).toBe("7010");
    expect(matchLocation({ locationName: "Someone New LLC", address: "1 Nowhere Lane" })).toBeNull();
  });

  it("fills a one-row property, leaves a shared or unmatched one alone, and keeps BI unless asked", async () => {
    const wb = await brokerForm();
    const sov = readSov(wb)!;
    const facts = portalFactsFor({ stories: "2", occupancyDescription: "Mercantile" }, { totalSqft: 82809, units: 27, annualGross: 2_400_000 });
    const all = { "4500": facts, "8200": portalFactsFor({ stories: "3" }, { totalSqft: 10000, units: 2, annualGross: 1 }) };

    const plan = planFill(sov, all);
    const gf = plan[0];
    expect(gf.status).toBe("matched");
    expect(gf.cells.filter((c) => c.changed).map((c) => [c.key, c.next])).toEqual([["stories", 2], ["units", 27], ["floorArea", 82809]]);
    expect(plan[1].status).toBe("shared");
    expect(plan[1].cells.some((c) => c.changed)).toBe(false);
    expect(plan[3].status).toBe("unmatched");

    const withBi = planFill(sov, all, { updateBi: true });
    expect(withBi[0].cells.find((c) => c.key === "biValues")).toMatchObject({ changed: true, next: 2_400_000 });

    // Written into the broker's own file: values in, formulas and everything else untouched.
    const ws = wb.getWorksheet("Property")!;
    expect(applyFill(ws, sov, withBi)).toBe(4);
    const back = newWorkbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    const b = back.getWorksheet("Property")!;
    expect(b.getCell("I6").value).toBe(2);        // stories
    expect(b.getCell("L6").value).toBe(82809);    // floor area
    expect(b.getCell("O6").value).toBe(2_400_000);// BI
    expect((b.getCell("M6").value as ExcelJS.CellFormulaValue).formula).toBe("N6/L6");
    expect((b.getCell("P11").value as ExcelJS.CellFormulaValue).formula).toBe("SUM(P6:P10)");
    expect(b.getCell("R6").value).toBe("keep me");
    expect(b.getCell("I7").value).toBe(1);         // the shared row is not touched
    expect(back.getWorksheet("Vacant Land")!.getCell("B4").value).toBe("Land Owner");
  });

  it("seeds only EMPTY facts, only for one-row properties, and never a non-year into Year Built", async () => {
    const sov = readSov(await brokerForm())!;
    const seed = seedableFacts(sov, { "4500": { constructionType: "Steel" } });
    expect(Object.keys(seed)).toEqual(["4500"]);
    expect(seed["4500"].constructionType).toBeUndefined();
    expect(seed["4500"]).toMatchObject({ occupancyDescription: "Mercantile", yearBuilt: 1989, stories: "1", pctSprinklered: "100%" });
    expect(seed["4500"].floorArea).toBeUndefined();
  });

  it("writes a percent as the fraction the form stores", () => {
    expect(cellValueFor("pctSprinklered", "63%")).toBeCloseTo(0.63);
    expect(cellValueFor("pctSprinklered", "100")).toBe(1);
    expect(cellValueFor("floorArea", "82,809")).toBe(82809);
    expect(cellValueFor("floorArea", "included in above")).toBe("included in above");
  });
});

describe("the built-in form (data/insurance/sov-template.xlsx)", () => {
  it("reads as a Statement of Values and every location matches a property", async () => {
    const { readFileSync } = await import("node:fs");
    const wb = newWorkbook();
    await wb.xlsx.load(readFileSync("data/insurance/sov-template.xlsx") as unknown as ArrayBuffer);
    const sov = readSov(wb)!;
    expect(sov.rows.length).toBe(27);
    expect(sov.rows.filter((r) => !matchLocation(r.values))).toEqual([]);
  });
});
