import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildManagementFeesWorkbook } from "./export";

const m = (v: number) => new Array(12).fill(v);
const b = (code: string, group: string, fee: number, budget: number, maxPosted: number) => ({
  code, key: code, name: `Building ${code}`, group, groupLabel: group,
  feeMonthly: m(fee).map((v, i) => (i < maxPosted ? v : 0)), budgetMonthly: m(budget),
  ytdActual: fee * maxPosted, ytdBudget: budget * maxPosted, annualBudget: budget * 12,
  maxPosted, hasGl: true, budgetFallback: false,
});
const data: any = {
  year: 2026, months: [], completeThrough: 7,
  buildings: [b("4050", "bp", 1000, 900, 7), b("4060", "bp", 500, 500, 6), b("9510", "sc", 2000, 2100, 7)],
  groups: [{ key: "bp", label: "Business Parks", codes: ["4050", "4060"] }, { key: "sc", label: "Shopping Centers", codes: ["9510"] }],
  portfolio: { actualMonthly: m(3500), budgetBottomUpMonthly: m(3500), likPlanMonthly: null, ytdActual: 0, ytdBudgetBottomUp: 0, annualBudgetBottomUp: 42000, likPlanYtd: null, likPlanAnnual: null },
};

async function readBack() {
  const wb = await buildManagementFeesWorkbook(data);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = back.getWorksheet("Management Fees")!;
  const rows: { r: number; a: unknown }[] = [];
  ws.eachRow((row, r) => rows.push({ r, a: row.getCell(1).value }));
  const rowOf = (label: string) => rows.find((x) => x.a === label)!.r;
  return { ws, rowOf };
}

describe("management fees workbook", () => {
  it("is a building per row with months across, then reprojection, budget and variance", async () => {
    const { ws, rowOf } = await readBack();
    const r = rowOf("4050");
    expect(ws.getCell(r, 2).value).toBe("Building 4050");
    // Jul posted (1,000), Aug not posted — carries the budget (900), in italics.
    expect(ws.getCell(r, 3 + 6).value).toBe(1000);
    expect(ws.getCell(r, 3 + 7).value).toBe(900);
    expect(ws.getCell(r, 3 + 7).font?.italic).toBe(true);
    // Reprojection = SUM of the row's months: 7 × 1,000 + 5 × 900.
    const reproj = ws.getCell(r, 15).value as any;
    expect(reproj.formula).toBe(`SUM(C${r}:N${r})`);
    expect(reproj.result).toBe(11500);
    expect(ws.getCell(r, 16).value).toBe(10800);
    expect((ws.getCell(r, 17).value as any).formula).toBe(`O${r}-P${r}`);
  });
  it("subtotals each group and totals the SUBTOTALS", async () => {
    const { ws, rowOf } = await readBack();
    const bp = rowOf("Total Business Parks"), sc = rowOf("Total Shopping Centers"), tot = rowOf("Total");
    const first = rowOf("4050"), last = rowOf("4060");
    expect((ws.getCell(bp, 15).value as any).formula).toBe(`SUM(O${first}:O${last})`);
    expect((ws.getCell(tot, 15).value as any).formula).toBe(`O${bp}+O${sc}`);
    // 4050 11,500 + 4060 (6 × 500 + 6 × 500) 6,000 + 9510 (7 × 2,000 + 5 × 2,100) 24,500
    expect((ws.getCell(tot, 15).value as any).result).toBe(42000);
  });
});
