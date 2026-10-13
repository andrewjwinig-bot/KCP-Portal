import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import { buildBalancePdf, buildBalanceXlsx } from "./export";
import type { BalanceView, ViewRow } from "./view";

const row = (o: Partial<ViewRow>): ViewRow => ({
  key: "K", name: "Line", group: "Shopping Centers", restricted: false, accounts: [], balance: 0,
  reserves: 0, reservesAuto: 0, reservesOverridden: false, netAvailable: 0, debt: null, loans: [], ...o,
});
const acct = (last4: string, balance: number) => ({ id: `JPM-Chase|${last4}`, bank: "JPM-Chase", last4, name: last4, link: null, balance, available: balance, asOf: "2026-10-13" });

const VIEW: BalanceView = {
  ym: "2026-10", groups: ["Shopping Centers", "Tenant Security Deposits"], unmatched: [], unplacedDebt: 0,
  byBank: [{ bank: "JPM-Chase", asOf: "2026-10-13", importedAt: "2026-10-13T16:00:00Z", importedBy: "Drew", accounts: 3 }],
  rows: [
    row({ key: "2300", name: "Brookwood", accounts: [acct("x5615", 1000)], balance: 1000, reserves: 100, netAvailable: 900, debt: 5000 }),
    row({ key: "4500", name: "Gray's Ferry", accounts: [acct("x0598", 500)], balance: 500, reserves: 0, netAvailable: 500 }),
    row({ key: "SD-x7216", name: "Security Deposits", group: "Tenant Security Deposits", restricted: true, accounts: [acct("x7216", 300)], balance: 300, reserves: 300, netAvailable: 0 }),
  ],
};

describe("bank balance exports", () => {
  it("writes live formulas that tie, read back from the file", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildBalanceXlsx(VIEW));
    const ws = wb.getWorksheet("Cash Position")!;
    const cells: Record<string, ExcelJS.Cell> = {};
    ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === "string") cells[c.value] = c; }));
    const brook = cells["Brookwood"].row;
    const net = ws.getCell(`E${brook}`).value as ExcelJS.CellFormulaValue;
    expect(net.formula).toBe(`C${brook}-D${brook}`);
    expect(net.result).toBe(900);
    const sub = ws.getCell(`C${cells["Total Shopping Centers"].row}`).value as ExcelJS.CellFormulaValue;
    expect(sub.formula).toMatch(/^SUM\(C\d+:C\d+\)$/);
    expect(sub.result).toBe(1500);
    const grand = ws.getCell(`C${cells["Total — All Properties"].row}`).value as ExcelJS.CellFormulaValue;
    expect(grand.formula).toMatch(/^C\d+\+C\d+$/); // adds the SUBTOTALS
    expect(grand.result).toBe(1800);
    const netGrand = ws.getCell(`E${cells["Total — All Properties"].row}`).value as ExcelJS.CellFormulaValue;
    expect(netGrand.result).toBe(1400); // deposits contribute nothing available
    expect(wb.getWorksheet("Accounts")!.rowCount).toBeGreaterThan(5);
  });
  it("renders a PDF", () => {
    const pdf = buildBalancePdf(VIEW);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
