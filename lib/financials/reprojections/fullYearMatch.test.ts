import { describe, it, expect } from "vitest";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { reproject } from "./compute";
import type { StatementMapping } from "@/lib/financials/operating-statements/types";

// The Operating Statements "Full Year" view builds each month's column from the
// single-month engine (computeStatement per period), and the full-year total as
// the year's YTD-through-December. This test proves that view ties out, line for
// line, to the Reprojections "Full-Year Actuals" (reproject in actuals mode,
// actualThroughMonth = 12) for the SAME consolidated GL — the empirical answer
// to "will the full-year operating statement match the prior-year reprojection?"

const mapping: StatementMapping = {
  propertyCode: "TEST",
  entityName: "Test Center LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [
      { label: "Rental income", mask: "4230-*" },
      { label: "Parking", mask: "4600-*" },
    ] },
    { name: "Reimbursement Income", role: "reimbursement", lines: [{ label: "CAM reimb", mask: "4900-*" }] },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [
      { label: "Maintenance Salaries", mask: "6030-8502" },
      { label: "Parking Lot Cleaning", mask: "6330-8502" },
    ] },
    { name: "General & Administrative", role: "non-reimbursable-expense", lines: [{ label: "G&A", mask: "8*-*" }] },
    { name: "Capital", role: "capital", lines: [{ label: "Tenant improvements", mask: "7100-*" }] },
    { name: "Debt Service", role: "debt-service", lines: [{ label: "Mortgage P&I", mask: "9500-*" }] },
  ],
};

// Non-constant monthly nets so any month-index mismatch would surface. Revenue
// stored as credits (negative); expenses/capital/debt as debits (positive).
const ramp = (base: number, step: number) => Array.from({ length: 12 }, (_, i) => base + step * i);
const glMonthly: Record<string, number[]> = {
  "4230-8501": ramp(-100, -3),  // rental income, growing credit
  "4600-8501": ramp(-20, -1),   // parking
  "4900-8501": ramp(-40, -2),   // CAM reimbursement
  "6030-8502": ramp(30, 1),     // maintenance salaries
  "6330-8502": ramp(12, 2),     // parking lot cleaning
  "8100-9301": ramp(15, 1),     // G&A (matches catch-all 8*-*)
  "8200-0000": ramp(7, 0),      // more G&A
  "7100-8501": ramp(0, 5),      // capital, ramping up
  "9500-8501": ramp(800, 0),    // mortgage
  "0110-0000": ramp(5000, 10),  // cash — unmapped, must not leak into any line
};

describe("Full-Year operating statement === Reprojections Full-Year Actuals", () => {
  const name = "Test Center";
  const year = 2025;

  // Full-Year op-statement build (mirrors the API route's fullYear payload).
  const perMonth = Array.from({ length: 12 }, (_, i) =>
    computeStatement({ mapping, propertyName: name, year, period: i + 1, gl: summaryForPeriod(glMonthly, i + 1) }),
  );
  const full = computeStatement({ mapping, propertyName: name, year, period: 12, gl: summaryForPeriod(glMonthly, 12) });

  // Reprojection in pure-actuals mode (a closed year: 12 actual months).
  const reproj = reproject({ mapping, propertyName: name, year, glMonthly, budgetLines: [], actualThroughMonth: 12 });

  it("every line's 12 monthly columns match the reprojection's actual series", () => {
    reproj.sections.forEach((rs, si) => {
      rs.lines.forEach((rl, li) => {
        const monthly = perMonth.map((pm) => pm.sections[si].lines[li].periodActual);
        expect(monthly).toEqual(rl.actual);
      });
    });
  });

  it("every line's Full-Year total matches the reprojection's reprojTotal", () => {
    reproj.sections.forEach((rs, si) => {
      rs.lines.forEach((rl, li) => {
        expect(full.sections[si].lines[li].ytdActual).toBeCloseTo(rl.reprojTotal, 6);
      });
    });
  });

  it("every section subtotal (monthly + total) matches", () => {
    reproj.sections.forEach((rs, si) => {
      const monthly = perMonth.map((pm) => pm.sections[si].subtotal.periodActual);
      expect(monthly).toEqual(rs.subtotal.actual);
      expect(full.sections[si].subtotal.ytdActual).toBeCloseTo(rs.subtotal.reprojTotal, 6);
    });
  });

  it("all rollups (monthly + Full-Year total) match", () => {
    const keys = ["totalRevenues", "totalOperatingExpenses", "netOperatingIncome", "cashFlowBeforeDebtService", "totalDebtService", "cashFlowAfterDebtService"] as const;
    for (const k of keys) {
      const monthly = perMonth.map((pm) => pm.rollups[k].periodActual);
      expect(monthly).toEqual(reproj.rollups[k].actual);
      expect(full.rollups[k].ytdActual).toBeCloseTo(reproj.rollups[k].reprojTotal, 6);
    }
  });

  it("the unmapped cash account leaks into neither view's lines", () => {
    // Present as unbudgeted/unmapped, not folded into any statement line.
    expect(reproj.unbudgetedAccounts.some((u) => u.account === "0110-0000")).toBe(true);
    expect(full.unmappedAccounts.some((u) => u.account === "0110-0000")).toBe(true);
  });
});
