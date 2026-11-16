import { describe, expect, it } from "vitest";
import { cardChargeReason, reclassByProperty, reclassLines } from "./ccReclass";

const tx = (o: Partial<{ vendor: string; description: string; ref: string; amount: number; month: number }>) => ({
  month: o.month ?? 3, date: "2026-03-31", vendor: o.vendor ?? "", description: o.description ?? "", ref: o.ref ?? "", amount: o.amount ?? 100,
});

describe("cardChargeReason", () => {
  it("reads the credit-card vendor", () => expect(cardChargeReason(tx({ vendor: "LIKM1" }))).toMatch(/LIKM1/));
  it("reads our CC invoice number", () => expect(cardChargeReason(tx({ ref: "CC23000826" }))).toBe("Invoice CC23000826"));
  it("ignores an outside vendor", () => expect(cardChargeReason(tx({ vendor: "ABC PLUMBING", ref: "10442" }))).toBeNull());
  it("ignores a cardholder reimbursement number", () => expect(cardChargeReason(tx({ ref: "CCREIMB0826" }))).toBeNull());
});

describe("reclassLines", () => {
  it("takes only 6220-8502 card charges, and totals them by property", () => {
    const lines = [
      ...reclassLines("2300", {
        "6220-8502": [tx({ vendor: "LIKM1", amount: 269.1 }), tx({ vendor: "ABC PLUMBING", amount: 900 })],
        "6220-8501": [tx({ vendor: "LIKM1", amount: 50 })],
      }),
      ...reclassLines("4500", { "6220-8502": [tx({ ref: "CC45000526", amount: 40 }), tx({ ref: "CC45000626", amount: 10.25 })] }),
    ];
    expect(lines.map((l) => l.amount)).toEqual([269.1, 40, 10.25]);
    expect(reclassByProperty(lines)).toEqual([
      { key: "2300", amount: 269.1, count: 1 },
      { key: "4500", amount: 50.25, count: 2 },
    ]);
  });
});

describe("buildReclassXlsx", () => {
  it("writes the entry with live totals and every line", async () => {
    const { buildReclassXlsx } = await import("./ccReclassExport");
    const ExcelJS = (await import("exceljs")).default;
    const lines = reclassLines("2300", { "6220-8502": [tx({ vendor: "LIKM1", amount: 269.1 }), tx({ ref: "CC23000526", amount: 30.9 })] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildReclassXlsx(2026, lines, { "2300": "Brookwood" }));
    const ws = wb.getWorksheet("Reclass Entry")!;
    const totals: unknown[] = [];
    ws.eachRow((row) => { if (row.getCell(1).value === "Total") totals.push(row.getCell(5).value); });
    expect(totals[0]).toMatchObject({ formula: expect.stringMatching(/^SUM\(E/) });
    expect(wb.getWorksheet("Charges")!.rowCount).toBeGreaterThan(2);
  });
});
