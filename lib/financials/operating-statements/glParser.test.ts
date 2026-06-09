import { describe, it, expect } from "vitest";
import { parseGeneralLedger, parseGeneralLedgerMonthly } from "./glParser";

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
  row({ 10: "1/1/2025 To 3/31/2025" }),
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

// ── Detailed General Ledger (single Amount column, dated transactions) ────────

function serial(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Mirrors the real 1100 Detailed GL: Property/Company header with name, a date
// range, an Amount column (col 19), account header rows that also hold the
// Beginning Balance, dated transactions, and per-month "<Month> Total" rows.
// Crucially the maintenance account has a DECEMBER-dated transaction (a prior-
// month invoice posted in January) — period must come from the "January Total"
// row, not the transaction date.
const detailed: Cell[][] = [
  row({ 10: "Property/Company : 1100 - Parkwood Professional Building" }),
  row({ 10: "1/1/2026 To 2/28/2026" }),
  row({ 0: "Trans Date", 4: "Vendor Name", 16: "Invoice Description", 19: "Amount" }),
  // Expense account with a non-zero beginning balance (prior-period accrual)
  // and a December-dated invoice posted in January.
  row({ 1: "6030-8502", 5: "Maintenance Salaries", 16: "Beginning Balance", 19: 3120 }),
  row({ 0: serial(2025, 12, 28), 4: "ADP (Dec invoice)", 19: 60 }),
  row({ 0: serial(2026, 1, 15), 4: "ADP", 19: 200 }),
  row({ 16: "January Total", 19: 260 }),
  row({ 16: "YTD Total", 19: 3380 }),
  // Revenue account (credit-normal → negative amounts), Jan + Feb totals.
  row({ 1: "4230-8501", 5: "Rental Income - Base Rent", 16: "Beginning Balance", 19: -39229.06 }),
  row({ 0: serial(2026, 1, 10), 19: -5054.38 }),
  row({ 16: "January Total", 19: -5054.38 }),
  row({ 0: serial(2026, 2, 5), 19: -1000 }),
  row({ 16: "February Total", 19: -1000 }),
  row({ 16: "YTD Total", 19: -45283.44 }),
];

describe("Detailed General Ledger parser", () => {
  it("reads property (with trailing name) + year from the header", () => {
    const res = parseGeneralLedger(detailed, 1);
    expect(res.propertyCode).toBe("1100");
    expect(res.year).toBe(2026);
  });

  it("captures the Beginning Balance + YTD Total per account (for balance-sheet ending balances)", () => {
    const m = parseGeneralLedgerMonthly(detailed);
    expect(m.beginning["6030-8502"]).toBe(3120);
    // The GL's own "YTD Total" row = ending balance = beginning + YTD net.
    expect(m.ytdTotal["6030-8502"]).toBe(3380);
    const ytd = (m.monthly["6030-8502"] ?? []).slice(0, 1).reduce((a, n) => a + n, 0);
    expect(m.beginning["6030-8502"] + ytd).toBe(3380);
  });

  it("reads the monthly Total rows, not transaction dates — a December invoice posted in January stays in January", () => {
    const res = parseGeneralLedger(detailed, 1);
    // maxPeriodInFile is 2 (Jan + Feb totals) — NOT 12 from the December txn date.
    expect(res.maxPeriodInFile).toBe(2);
    const maint = res.rows.find((r) => r.account === "6030-8502")!;
    expect(maint.periodActual).toBe(260); // January Total, not 3120/3380
    expect(maint.ytdActual).toBe(260);
  });

  it("derives period + YTD across months from the Total rows", () => {
    const res = parseGeneralLedger(detailed, 2);
    const rent = res.rows.find((r) => r.account === "4230-8501")!;
    expect(rent.periodActual).toBeCloseTo(-1000, 2); // February only
    expect(rent.ytdActual).toBeCloseTo(-6054.38, 2); // Jan + Feb
  });
});

