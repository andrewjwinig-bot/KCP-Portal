import { describe, it, expect } from "vitest";
import { parseGeneralLedger, parseGeneralLedgerMonthly, parseGeneralLedgerByYear, reconcileGl } from "./glParser";

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
  row({ 1: "01/20/25", 5: "Deposit", 20: "CR", 21: "02", 22: 5000 }),
  monthTotal("January", 5000, 4000, 432318.97),
  // Account grand-"Total" row (Multi-Year layout) — Balance = ending balance.
  row({ 9: "Total", 22: 5000, 25: 4000, 28: 432318.97 }),
];

describe("Skyline GL parser", () => {
  it("reads property + year from the header", () => {
    const res = parseGeneralLedger(sheet, 2);
    expect(res.propertyCode).toBe("7010");
    expect(res.year).toBe(2025);
  });

  it("captures the account name from the header row", () => {
    const m = parseGeneralLedgerMonthly(sheet);
    expect(m.names["6030-8502"]).toBe("Maintenance Salaries");
    expect(m.names["0110-0000"]).toBe("Cash-Operating");
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

  // Multi-Year GL layout (2024 and prior): the same Debit/Credit report also
  // carries per-account Beginning Balance, an ending "Total" row, and dated
  // transactions — captured so these imports get the Cash KPI + line drill-down.
  it("captures the Beginning Balance from the account header's Balance column", () => {
    const m = parseGeneralLedgerMonthly(sheet);
    expect(m.beginning["0110-0000"]).toBe(431318.97); // balance-sheet opening
    expect(m.beginning["6030-8502"]).toBe(0);          // P&L opens at $0
  });

  it("captures the account grand-Total ending balance (beginning + net = ending)", () => {
    const m = parseGeneralLedgerMonthly(sheet);
    expect(m.ytdTotal["0110-0000"]).toBe(432318.97);
    const janNet = (m.monthly["0110-0000"] ?? [])[0];
    expect(m.beginning["0110-0000"] + janNet).toBeCloseTo(m.ytdTotal["0110-0000"], 2);
  });

  it("captures dated transactions with the signed net (Debit − Credit), bucketed by month", () => {
    const m = parseGeneralLedgerMonthly(sheet);
    const maint = m.transactions["6030-8502"] ?? [];
    expect(maint).toHaveLength(1);
    expect(maint[0]).toMatchObject({ month: 1, amount: 100, date: "01/15/25" }); // debit → +100
    const cash = m.transactions["0110-0000"] ?? [];
    expect(cash[0]).toMatchObject({ month: 1, amount: 5000, date: "01/20/25" });
  });

  it("reconciles: beginning + Σ(monthly nets) == reported ending balance", () => {
    const m = parseGeneralLedgerMonthly(sheet);
    const rec = reconcileGl(m);
    // Only the cash account reported an ending "Total" row in this fixture.
    expect(rec.checked).toBe(1);
    expect(rec.reconciled).toBe(1);
    expect(rec.mismatches).toHaveLength(0);
  });

  it("flags a mismatch when an ending balance doesn't tie (e.g. a mis-read column)", () => {
    const m = parseGeneralLedgerMonthly(sheet);
    m.ytdTotal["0110-0000"] = 999999; // corrupt the reported ending
    const rec = reconcileGl(m);
    expect(rec.mismatches).toHaveLength(1);
    expect(rec.mismatches[0].account).toBe("0110-0000");
  });
});

// ── Multi-Year General Ledger (a range spanning >1 year) ─────────────────────
describe("Multi-Year GL range handling", () => {
  const my: Cell[][] = [
    row({ 10: "Property/Company : 4500" }),
    row({ 10: "1/1/2023 To 12/31/2024" }), // TWO years
    row({ 5: "Description", 23: "Debit", 25: "Credit", 28: "Balance" }),
    row({ 1: "6030-8502", 7: "Maintenance Salaries", 28: 0 }),
    row({ 6: "January 2023 Total", 22: 500, 25: 0, 28: 500 }),   // prior year — must NOT bucket
    row({ 6: "January 2024 Total", 22: 100, 25: 0, 28: 600 }),   // target year → Jan
    row({ 6: "February 2024 Total", 22: 150, 25: 0, 28: 750 }),
  ];
  it("buckets into the range's END year and does not let 2023 overwrite 2024", () => {
    const m = parseGeneralLedgerMonthly(my);
    expect(m.year).toBe(2024);
    expect(m.multiYear).toBe(true);
    expect(m.yearsCovered).toEqual([2023, 2024]);
    expect((m.monthly["6030-8502"] ?? [])[0]).toBe(100); // Jan 2024, not 500 (2023)
    expect((m.monthly["6030-8502"] ?? [])[1]).toBe(150); // Feb 2024
  });
});

// ── Multi-Year split — one stored GL per year from a single upload ────────────
describe("parseGeneralLedgerByYear — split a multi-year GL into per-year records", () => {
  // A 3-year range for one property. Running balance accumulates across years;
  // per-year nets come from each month total's Debit − Credit.
  // Cash (balance-sheet): opening 1000, +100/yr (net 100 each Jan).
  const mk = (y: number, deb: number, cred: number, bal: number) => row({ 6: `January ${y} Total`, 22: deb, 25: cred, 28: bal });
  const sheet3: Cell[][] = [
    row({ 10: "Property/Company : 4500" }),
    row({ 10: "1/1/2022 To 12/31/2024" }), // THREE years
    row({ 5: "Description", 23: "Debit", 25: "Credit", 28: "Balance" }),
    // Expense account — 3 different yearly amounts.
    row({ 1: "6030-8502", 7: "Maintenance Salaries", 28: 0 }),
    mk(2022, 200, 0, 200),
    mk(2023, 300, 0, 500),
    mk(2024, 400, 0, 900),
    row({ 9: "Total", 22: 900, 25: 0, 28: 900 }),
    // Cash — running balance, opening 1000.
    row({ 1: "0110-0000", 7: "Cash-Operating", 28: 1000 }),
    mk(2022, 100, 0, 1100),
    mk(2023, 100, 0, 1200),
    mk(2024, 100, 0, 1300),
    row({ 9: "Total", 22: 300, 25: 0, 28: 1300 }),
  ];

  const byYear = parseGeneralLedgerByYear(sheet3);

  it("returns one record per year, sorted ascending, all flagged multiYear", () => {
    expect(byYear.map((r) => r.year)).toEqual([2022, 2023, 2024]);
    expect(byYear.every((r) => r.multiYear)).toBe(true);
    expect(byYear[0].yearsCovered).toEqual([2022, 2023, 2024]);
  });

  it("assigns each year its own monthly nets (no cross-year bleed)", () => {
    const jan = (y: number) => (byYear.find((r) => r.year === y)!.monthly["6030-8502"] ?? [])[0];
    expect(jan(2022)).toBe(200);
    expect(jan(2023)).toBe(300);
    expect(jan(2024)).toBe(400);
  });

  it("derives each year's cash opening (prior ending) and ending from the running balance", () => {
    const cash = (y: number) => byYear.find((r) => r.year === y)!;
    expect(cash(2022).beginning["0110-0000"]).toBe(1000); // 1100 − 100
    expect(cash(2023).beginning["0110-0000"]).toBe(1100); // ending of 2022
    expect(cash(2024).beginning["0110-0000"]).toBe(1200);
    expect(cash(2024).ytdTotal["0110-0000"]).toBe(1300); // ending 2024
  });

  it("each year reconciles independently (beginning + net = ending)", () => {
    for (const rec of byYear.map(reconcileGl)) expect(rec.mismatches).toHaveLength(0);
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

  it("captures the account name from the header row", () => {
    const m = parseGeneralLedgerMonthly(detailed);
    expect(m.names["6030-8502"]).toBe("Maintenance Salaries");
    expect(m.names["4230-8501"]).toBe("Rental Income - Base Rent");
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

