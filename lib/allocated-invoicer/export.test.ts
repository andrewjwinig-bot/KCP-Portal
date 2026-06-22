import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildAllocExportXlsx, type AllocExportRow } from "./export";

function row(propertyId: string, propertyName: string, accountCode: string, accountName: string, allocAmount: number): AllocExportRow {
  return { propertyId, propertyName, accountCode, accountName, accountSuffix: accountCode.split("-")[1] as any, grossAmount: allocAmount * 2, allocPct: 0.5, allocAmount };
}

function buildBook() {
  const rows = [
    row("3610", "Bldg 1", "7110-9301", "Marketing", 500.49),
    row("3610", "Bldg 1", "8940-9301", "Telephone", 100.51),
    row("4050", "Bldg 5", "7110-9301", "Marketing", 300),
  ];
  const blob = buildAllocExportXlsx({
    periodText: "1/1/2026 To 6/30/2026",
    rows,
    propertyOrder: [{ id: "3610", name: "Bldg 1" }, { id: "4050", name: "Bldg 5" }],
    accountCodes: ["7110-9301", "8940-9301"],
  });
  return blob.arrayBuffer().then((ab) =>
    XLSX.read(Buffer.from(ab), { type: "buffer", cellNF: true, cellStyles: true }),
  );
}

describe("allocated expenses Summary tab", () => {
  it("has an account-name header row above the account-code row", async () => {
    const ws = (await buildBook()).Sheets["Summary"];
    // Row 1 = names, Row 2 = codes
    expect(ws["C1"].v).toBe("Marketing");
    expect(ws["D1"].v).toBe("Telephone");
    expect(ws["C2"].v).toBe("7110-9301");
    expect(ws["D2"].v).toBe("8940-9301");
    expect(ws["A2"].v).toBe("Property");
    expect(ws["E2"].v).toBe("TOTAL"); // TOTAL column header
  });

  it("labels the sum row TOTAL and uses SUM formulas for the row + column", async () => {
    const ws = (await buildBook()).Sheets["Summary"];
    // Data rows are 3 (Bldg 1) and 4 (Bldg 5); TOTAL row is 5.
    expect(ws["A5"].v).toBe("TOTAL");
    // TOTAL column = per-row SUM across the code columns
    expect(ws["E3"].f).toBe("SUM(C3:D3)");
    // TOTAL row = per-column SUM down the data rows
    expect(ws["C5"].f).toBe("SUM(C3:C4)");
    // grand total
    expect(ws["E5"].f).toBe("SUM(E3:E4)");
    // cached values tie out
    expect(ws["E3"].v).toBeCloseTo(601.0, 2);
    expect(ws["C5"].v).toBeCloseTo(800.49, 2);
    expect(ws["E5"].v).toBeCloseTo(901.0, 2);
  });

  it("formats money cells as whole dollars with commas", async () => {
    const wb = await buildBook();
    const sum = wb.Sheets["Summary"];
    const alloc = wb.Sheets["Allocations"];
    expect(sum["C3"].z).toBe("$#,##0;($#,##0)");   // data cell
    expect(sum["E5"].z).toBe("$#,##0;($#,##0)");   // grand total
    expect(alloc["F2"].z).toBe("$#,##0;($#,##0)"); // Gross Amount
    expect(alloc["H2"].z).toBe("$#,##0;($#,##0)"); // Allocated Amount
  });
});
