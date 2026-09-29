import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { estimateRows, estimateTotals } from "./estimatesByTenant";
import { buildEstimatesXlsx } from "./estimatesExport";

const m = (v: number) => new Array(12).fill(v);
const row = (o: any) => ({ unitRef: "7010-1", tenant: "Acme", sqft: 1200, status: "contracted", rent: m(2000), cam: m(0), ins: m(0), ret: m(0), assumed: m(0).map(() => false), ...o });

describe("CAM estimates by tenant", () => {
  const rows = estimateRows([
    row({ unitRef: "7010-1", cam: m(500), ins: m(100), ret: m(400), billing: { cam: 400, ins: 100, ret: 300, rent: 2000 } }),
    // A lease ending in June: its estimate is averaged over the months billed, not twelve.
    row({ unitRef: "7010-2", tenant: "Shortco", cam: [...m(300).slice(0, 6), ...m(0).slice(0, 6)], billing: { cam: 300, ins: 0, ret: 0, rent: 1500 } }),
    // A new lease: nothing billed today.
    row({ unitRef: "7010-3", tenant: "Newco", cam: m(250) }),
    // Gross lease, nothing either side: left out.
    row({ unitRef: "7010-4", tenant: "Gross", billing: { cam: 0, ins: 0, ret: 0, rent: 900 } }),
    // Vacant: left out.
    row({ unitRef: "7010-5", tenant: "", rent: m(0) }),
  ] as any);

  it("today vs the budget, per month, with the whole bill", () => {
    const a = rows.find((r) => r.unitRef === "7010-1")!;
    expect(a.now).toMatchObject({ recoveries: 800, total: 2800 });
    expect(a.next).toMatchObject({ cam: 500, ins: 100, ret: 400, recoveries: 1000, total: 3000 });
    expect(a.change).toBe(200);
    expect(a.changePct).toBeCloseTo(25, 6);
    expect(a.totalChange).toBe(200);
    expect(a.jump).not.toBeNull(); // +25% and +$200/mo clears both floors
  });
  it("averages over the months billed", () => {
    expect(rows.find((r) => r.unitRef === "7010-2")!.next.cam).toBe(300);
  });
  it("a new lease has no today and no %", () => {
    const n = rows.find((r) => r.unitRef === "7010-3")!;
    expect(n.now).toBeNull();
    expect(n.changePct).toBeNull();
    expect(n.change).toBe(250);
  });
  it("leaves out gross leases and vacancies", () => {
    expect(rows.map((r) => r.unitRef)).toEqual(["7010-1", "7010-2", "7010-3"]);
  });
  it("totals", () => {
    const t = estimateTotals(rows);
    expect(t.now.recoveries).toBe(1100);
    expect(t.next.recoveries).toBe(1550);
    expect(t.flagged).toBe(1);
  });
  it("the workbook ties: live formulas for every derived figure", async () => {
    const buf = await buildEstimatesXlsx({ propertyName: "Parkwood", propertyCode: "7010", year: 2027, rows });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const ws = wb.worksheets[0];
    let head = 0;
    ws.eachRow((r, i) => { if (!head && r.getCell(1).value === "Suite") head = i; });
    expect(head).toBeGreaterThan(0);
    const first = ws.getRow(head + 1);
    expect(first.getCell(1).value).toBe("7010-1");
    expect((first.getCell(7).value as any).formula).toBe(`SUM(D${head + 1}:F${head + 1})`);
    expect((first.getCell(12).value as any).result).toBe(200);
    const tot = ws.getRow(head + 1 + rows.length);
    expect(tot.getCell(2).value).toBe("Total");
    expect((tot.getCell(11).value as any).formula).toMatch(/^SUM\(K/);
    expect((tot.getCell(11).value as any).result).toBe(1550);
  });
});
