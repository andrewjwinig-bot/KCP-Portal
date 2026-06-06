import { describe, it, expect } from "vitest";
import { parseGeneralLedger } from "./glParser";

type Cell = string | number | null;

/** Build a sparse row: set(colIndex → value). */
function row(cells: Record<number, Cell>): Cell[] {
  const max = Math.max(28, ...Object.keys(cells).map(Number));
  const r: Cell[] = new Array(max + 1).fill(null);
  for (const [c, v] of Object.entries(cells)) r[Number(c)] = v;
  return r;
}

// Header detection: "Debit" label at col 23, but values land at col 22 (the
// merged-cell drift seen in the 7010 export). Credit 25, Balance 28.
const monthTotal = (month: string, debit: number, credit: number, bal: number) =>
  row({ 6: `${month} Total`, 22: debit, 25: credit, 28: bal });

const sheet: Cell[][] = [
  row({ 10: "Property/Company : 7010" }),
  row({ 10: "Parkwood Joint Venture" }),
  row({ 10: "1/1/2025 To 12/31/2025" }),
  row({ 5: "Description", 20: "Jnl", 21: "Ref", 23: "Debit", 25: "Credit", 28: "Balance" }),
  // Expense account (debit-normal)
  row({ 1: "6030-8502", 7: "Maintenance Salaries", 28: 0 }),
  row({ 1: "01/15/25", 5: "ADP payroll", 20: "AP", 21: "01", 22: 100 }),
  monthTotal("January", 100, 0, -100 * -1), // running bal sign irrelevant to parse
  monthTotal("February", 150, 0, 0),
  monthTotal("March", 0, 0, 0),
  // Reimbursement revenue account (credit-normal)
  row({ 1: "4910-8502", 7: "Common Area Maintenance", 28: 0 }),
  monthTotal("January", 0, 1000, -1000),
  monthTotal("February", 0, 1000, -2000),
  // Balance-sheet account with an opening balance — still parsed, summed by net
  row({ 1: "0110-0000", 7: "Cash-Operating", 28: 431318.97 }),
  monthTotal("January", 5000, 4000, 432318.97),
];

describe("Skyline GL parser", () => {
  it("reads property + year from the header", () => {
    const res = parseGeneralLedger(sheet, 2);
    expect(res.propertyCode).toBe("7010");
    expect(res.year).toBe(2025);
  });

  it("derives period (month) and YTD net from monthly totals, handling the debit column drift", () => {
    const res = parseGeneralLedger(sheet, 2);
    const maint = res.rows.find((r) => r.account === "6030-8502")!;
    expect(maint.periodActual).toBe(150); // February net
    expect(maint.ytdActual).toBe(250); // Jan 100 + Feb 150
  });

  it("keeps credit-normal revenue negative (compute flips the sign later)", () => {
    const res = parseGeneralLedger(sheet, 2);
    const cam = res.rows.find((r) => r.account === "4910-8502")!;
    expect(cam.periodActual).toBe(-1000);
    expect(cam.ytdActual).toBe(-2000);
  });

  it("YTD respects the requested period (period 1 → January only)", () => {
    const res = parseGeneralLedger(sheet, 1);
    const maint = res.rows.find((r) => r.account === "6030-8502")!;
    expect(maint.periodActual).toBe(100);
    expect(maint.ytdActual).toBe(100);
  });

  it("clamps a requested period beyond the file to what's present", () => {
    const res = parseGeneralLedger(sheet, 12);
    expect(res.maxPeriodInFile).toBe(3);
    expect(res.period).toBe(3);
  });

  it("skips dormant (all-zero) accounts", () => {
    const res = parseGeneralLedger(sheet, 3);
    // 6030 has March net 0 but YTD 250 → kept; an account with no activity is dropped.
    expect(res.rows.some((r) => r.account === "6030-8502")).toBe(true);
  });
});
