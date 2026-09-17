import { describe, it, expect } from "vitest";
import { computeStatement, type ComputeInput } from "./compute";
import type { GlSummaryRow, LineBudget, StatementMapping } from "./types";

const mapping: StatementMapping = {
  propertyCode: "TEST",
  entityName: "Test Center LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [{ label: "Rental income", mask: "4230-*" }] },
    { name: "Reimbursements", role: "reimbursement", lines: [{ label: "Common Area", mask: "4910-8501" }] },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [{ label: "Maintenance", mask: "6030-8502" }] },
    { name: "Non-Reimbursable Expenses", role: "non-reimbursable-expense", lines: [{ label: "Marketing", mask: "7*-*" }] },
    { name: "Capital", role: "capital", lines: [{ label: "Tenant improvements", mask: "1440-0000" }] },
    { name: "Debt Service", role: "debt-service", lines: [{ label: "Interest", mask: "9210-*" }] },
  ],
};

// Skyline-signed: revenue credits negative, expenses positive.
const gl: GlSummaryRow[] = [
  { account: "4230-8501", periodActual: -100, ytdActual: -1000 },
  { account: "4910-8501", periodActual: -20, ytdActual: -200 },
  { account: "6030-8502", periodActual: 30, ytdActual: 300 },
  { account: "7110-8501", periodActual: 10, ytdActual: 100 },
  { account: "1440-0000", periodActual: 5, ytdActual: 50 },
  { account: "9210-8501", periodActual: 2, ytdActual: 20 },
  { account: "6810-8501", periodActual: 0, ytdActual: 999 }, // depreciation — unmapped
];

// Keyed by (section name | line mask) — the budgetLookup contract now passes
// the line's mask + its sibling masks (so a crosswalk can claim accounts).
const budgets: Record<string, LineBudget> = {
  "Revenues|4230-*": { periodBudget: 90, ytdBudget: 900, annualBudget: 1080 },
  "Reimbursable Expenses|6030-8502": { periodBudget: 25, ytdBudget: 250, annualBudget: 300 },
};
const budgetLookup: ComputeInput["budgetLookup"] = (s, mask) => budgets[`${s}|${mask}`] ?? null;

describe("operating-statement compute", () => {
  const st = computeStatement({ mapping, propertyName: "Test Center", year: 2025, period: 10, gl, budgetLookup });
  const r = st.rollups;

  it("flips revenue credits to positive and sums expenses as-is", () => {
    const rev = st.sections[0].lines[0];
    expect(rev.periodActual).toBe(100);
    expect(rev.ytdActual).toBe(1000);
    const maint = st.sections[2].lines[0];
    expect(maint.periodActual).toBe(30);
  });

  it("matches wildcard masks (7*-* → marketing)", () => {
    expect(st.sections[3].lines[0].periodActual).toBe(10);
    expect(st.sections[3].lines[0].accounts).toEqual(["7110-8501"]);
  });

  it("Total Revenues = revenue + reimbursement", () => {
    expect(r.totalRevenues.periodActual).toBe(120);
    expect(r.totalRevenues.ytdActual).toBe(1200);
  });

  it("Total Operating Expenses sums all expense sections", () => {
    expect(r.totalOperatingExpenses.periodActual).toBe(40);
    expect(r.totalOperatingExpenses.ytdActual).toBe(400);
  });

  it("NOI = Total Revenues − Total Operating Expenses", () => {
    expect(r.netOperatingIncome.periodActual).toBe(80);
    expect(r.netOperatingIncome.ytdActual).toBe(800);
  });

  it("Cash Flow Before Debt = NOI − capital; After = CFBD − debt service", () => {
    expect(r.cashFlowBeforeDebtService.periodActual).toBe(75);
    expect(r.cashFlowBeforeDebtService.ytdActual).toBe(750);
    expect(r.totalDebtService.periodActual).toBe(2);
    expect(r.cashFlowAfterDebtService.periodActual).toBe(73);
    expect(r.cashFlowAfterDebtService.ytdActual).toBe(730);
  });

  it("revenue variance is favorable when actual exceeds budget", () => {
    const rev = st.sections[0].lines[0];
    expect(rev.periodVariance).toBe(10); // 100 − 90, favorable
    expect(rev.ytdVariance).toBe(100); // 1000 − 900
  });

  it("expense variance is favorable when actual is under budget (budget − actual)", () => {
    const maint = st.sections[2].lines[0];
    expect(maint.periodVariance).toBe(-5); // over budget by 5 → unfavorable
    expect(maint.ytdVariance).toBe(-50);
  });

  it("renders blank variance when no budget is mapped", () => {
    expect(st.sections[1].lines[0].periodVariance).toBeNull(); // Common Area, no budget
    expect(st.sections[1].lines[0].periodBudget).toBeNull();
  });

  it("flags unmapped GL accounts for the trial-balance tie-out", () => {
    expect(st.unmappedAccounts).toEqual([{ account: "6810-8501", ytdActual: 999 }]);
  });
});

// The green "✓ paid <month>" marker claims the year's obligation has ALREADY
// BEEN MET, so a $0 month is expected. Two ways that claim can be wrong.
describe("the fully-funded (prepaid) marker", () => {
  const fundedMapping: StatementMapping = {
    propertyCode: "TEST",
    entityName: "Test Center LP",
    sections: [
      {
        name: "Non-Reimbursable Expenses",
        role: "non-reimbursable-expense",
        lines: [
          { label: "Insurance", mask: "6400-*" },
          { label: "Legal & Accounting", mask: "6500-*" },
        ],
      },
    ],
  };
  const run = (rows: GlSummaryRow[], b: Record<string, LineBudget>) =>
    computeStatement({
      mapping: fundedMapping,
      propertyName: "Test Center",
      year: 2026,
      period: 7,
      gl: rows,
      budgetLookup: (s, mask) => b[`${s}|${mask}`] ?? null,
    }).sections[0].lines;

  it("still marks a genuine prepaid annual obligation", () => {
    // Nothing posted in July; the whole annual premium already booked.
    const [ins] = run(
      [{ account: "6400-8501", periodActual: 0, ytdActual: 12_000 }],
      { "Non-Reimbursable Expenses|6400-*": { periodBudget: 1_000, ytdBudget: 7_000, annualBudget: 12_000 } },
    );
    expect(ins.fullyFundedYtd).toEqual({ ytdActual: 12_000, annualBudget: 12_000 });
  });

  it("does not mark an AS-NEEDED line — its budget is a provision, not an obligation", () => {
    // 9510's July, the real numbers: $103 budgeted for the month, nothing
    // posted, $10,460 spent YTD against a ~$1,236 annual provision. That line
    // is 1,350% over and it was carrying a green "✓ paid Jun".
    const [, legal] = run(
      [{ account: "6500-8501", periodActual: 0, ytdActual: 10_460 }],
      { "Non-Reimbursable Expenses|6500-*": { periodBudget: 103, ytdBudget: 721, annualBudget: 1_236 } },
    );
    expect(legal.fullyFundedYtd).toBeNull();
  });

  it("does not mark a contractual line that blew through its annual budget", () => {
    // 8x the annual premium is an overrun, not a prepayment — whatever the
    // line is called.
    const [ins] = run(
      [{ account: "6400-8501", periodActual: 0, ytdActual: 96_000 }],
      { "Non-Reimbursable Expenses|6400-*": { periodBudget: 1_000, ytdBudget: 7_000, annualBudget: 12_000 } },
    );
    expect(ins.fullyFundedYtd).toBeNull();
  });

  it("leaves room for a renewal increase", () => {
    // A premium up 35% on renewal is still a prepaid annual obligation.
    const [ins] = run(
      [{ account: "6400-8501", periodActual: 0, ytdActual: 16_200 }],
      { "Non-Reimbursable Expenses|6400-*": { periodBudget: 1_000, ytdBudget: 7_000, annualBudget: 12_000 } },
    );
    expect(ins.fullyFundedYtd).toEqual({ ytdActual: 16_200, annualBudget: 12_000 });
  });
});
