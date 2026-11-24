import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseGLExcel } from "./glParser";

// Build a worksheet that mimics the Skyline "Detailed General Ledger" layout:
// a single signed Amount column (col 19), Trans Date in col 0, account codes in
// col 1, mid-section monthly subtotal rows, and large invoice-number columns
// that must NOT be read as amounts. Sparse rows mirror the real column indices.
function row(cells: Record<number, unknown>): unknown[] {
  const r: unknown[] = [];
  const max = Math.max(...Object.keys(cells).map(Number));
  for (let i = 0; i <= max; i++) r[i] = cells[i] ?? "";
  return r;
}

function buildDetailedGL(): ArrayBuffer {
  const rows: unknown[][] = [
    row({ 14: "Detailed General Ledger" }),
    row({ 10: "Property/Company : 2000 - c/o Korman Commercial Properties" }),
    row({ 10: "1/1/2026 To 6/30/2026" }),
    row({}),
    row({ 0: "Trans Date", 4: "\nVendor Name", 9: "Check # / Jnl Ref", 12: "Invoice Number / Journal", 16: "Invoice Description / \nJnl Description", 19: "\nAmount" }),
    // Target account 7110-9301 — beginning balance rides the header row (ignored)
    row({ 1: "7110-9301", 5: "Marketing", 16: "                              Beginning Balance", 19: 164973.01 }),
    row({ 0: "1/15/2026", 4: "LoopNet", 9: "614066", 12: "201847650582", 16: "Marketing Salaries", 19: 2629.67 }),
    row({ 0: "1/20/2026", 4: "CoStar", 9: "614064", 12: "400026370380001", 16: "Listing", 19: 722.86 }),
    row({ 16: "                              January Total", 19: 3352.53 }),
    row({ 16: "                              YTD Total", 19: 168325.54 }),
    row({ 0: "2/15/2026", 4: "LoopNet", 9: "614102", 12: "123480903", 16: "Marketing Salaries", 19: 1000.00 }),
    row({ 16: "                              February Total", 19: 1000.00 }),
    row({}),
    // Second target account
    row({ 1: "8940-9302", 5: "Telephone", 16: "Beginning Balance", 19: 500 }),
    row({ 0: "1/31/2026", 4: "Verizon", 12: "999888777", 16: "Phone", 19: 300.50 }),
    row({ 0: "3/31/2026", 4: "Verizon", 12: "111222333", 16: "Phone", 19: -50.50 }),
    // Non-target account — must be ignored entirely
    row({ 1: "0110-0000", 5: "Cash-Operating", 16: "Beginning Balance", 19: 98710.85 }),
    row({ 0: "1/05/2026", 4: "Bank", 12: "555", 16: "Transfer", 19: 99999.99 }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return (out instanceof Uint8Array
    ? out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
    : out) as ArrayBuffer;
}

describe("parseGLExcel — Detailed General Ledger (single Amount column)", () => {
  const result = parseGLExcel(buildDetailedGL());

  it("reads the multi-month date range", () => {
    expect(result.periodText).toMatch(/1\/1\/2026\s+To\s+6\/30\/2026/i);
    expect(result.periodEndDate).toBe("2026-06-30");
    expect(result.statementMonth).toBe("2026-01_to_2026-06");
  });

  it("sums each account across ALL months, excluding subtotal + beginning-balance rows", () => {
    // 2629.67 (Jan) + 722.86 (Jan) + 1000.00 (Feb) — NOT the 164,973 balance,
    // NOT the January/YTD Total rows, NOT the invoice numbers.
    expect(result.accountTotals.get("7110-9301")?.netTotal).toBeCloseTo(4352.53, 2);
    // 300.50 (Jan) − 50.50 (Mar)
    expect(result.accountTotals.get("8940-9302")?.netTotal).toBeCloseTo(250.0, 2);
  });

  it("ignores non-9301/9302/9303 accounts", () => {
    expect(result.accountTotals.has("0110-0000")).toBe(false);
  });

  it("never reads invoice numbers as amounts (no absurd totals)", () => {
    const grand = [...result.accountTotals.values()].reduce((a, t) => a + t.netTotal, 0);
    expect(Math.abs(grand)).toBeLessThan(1_000_000);
  });

  it("keeps transactions from every month of the range", () => {
    const months = new Set(result.transactions.map((t) => t.date.split("/")[0]));
    expect(months.has("1")).toBe(true);
    expect(months.has("2")).toBe(true);
    expect(months.has("3")).toBe(true);
  });
});
