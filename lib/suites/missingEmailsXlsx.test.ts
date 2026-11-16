import { describe, expect, it } from "vitest";
import { buildFillSheet, readFillSheet } from "./missingEmailsXlsx";
import { newWorkbook } from "@/lib/excel/theme";

// Synthetic tenants only.
const rows = [
  { unitRef: "9999-101", propertyCode: "9999", propertyName: "Test Center", suite: "101", tenantName: "Alpha Co", skylineContact: "Pat", skylinePhone: "555-0100" },
  { unitRef: "9999-102", propertyCode: "9999", propertyName: "Test Center", suite: "102", tenantName: "Beta LLC", skylineContact: null, skylinePhone: null },
];

describe("tenant email fill-in sheet", () => {
  it("round-trips: what is typed in the Email column comes back by unit", async () => {
    const bytes = await buildFillSheet(rows, { who: "Test", asOf: "November 16, 2026" });
    const wb = newWorkbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    let head = 0;
    ws.eachRow((r, n) => { if (!head && r.getCell(1).value === "Unit Ref") head = n; });
    expect(head).toBeGreaterThan(1); // a letterhead sits above it
    ws.getCell(head + 1, 7).value = "ap@alpha.com; owner@alpha.com";
    ws.getCell(head + 1, 8).value = "Pat Smith";
    const filled = new Uint8Array(await wb.xlsx.writeBuffer());
    const got = await readFillSheet(Buffer.from(filled));
    expect(got).toEqual([{ unitRef: "9999-101", email: "ap@alpha.com; owner@alpha.com", name: "Pat Smith", row: head + 1 }]);
  });

  it("finds the header by name, whatever the column order", async () => {
    const wb = newWorkbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(["Some title"]);
    ws.addRow(["Email (fill in)", "Tenant", "Unit Ref"]);
    ws.addRow(["a@b.com", "Alpha", "9999-101"]);
    ws.addRow(["", "Beta", "9999-102"]);
    const got = await readFillSheet(Buffer.from(new Uint8Array(await wb.xlsx.writeBuffer())));
    expect(got.map((g) => [g.unitRef, g.email])).toEqual([["9999-101", "a@b.com"]]);
  });
});
