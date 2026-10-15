import { describe, it, expect } from "vitest";
import { allocatePayroll, seedPayrollBudget } from "./payrollBudget";
import { payrollBudgetBlocks, payrollTargets, LIK_PAYROLL_GL } from "./payrollFlow";
import { allocatePool } from "./payrollPools";

describe("the payroll budget flows into the property budgets", () => {
  const doc = seedPayrollBudget(2027);
  const a = allocatePayroll(doc);
  const targets = payrollTargets(a);
  const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

  it("lands every dollar allocated — nothing lost between the payroll budget and the properties", () => {
    expect(sum(targets.map((t) => t.annual))).toBeCloseTo(a.allocated, 2);
  });

  it("2010 carries everyone allocated to LIK Operating + Other, on 8000-9900 Payroll & Benefits", () => {
    const lik = targets.filter((t) => t.code === "2010");
    expect(lik).toHaveLength(1);
    expect(lik[0].gl).toBe(LIK_PAYROLL_GL);
    expect(lik[0].annual).toBeCloseTo(a.misc.find((m) => m.code === "2010")!.annual, 2);
    expect(lik[0].annual).toBeGreaterThan(0);
  });

  it("each fund building gets its own row's dollars, by account", () => {
    for (const f of a.funds) for (const r of f.rows) {
      const mine = targets.filter((t) => t.code === r.code);
      expect(sum(mine.map((t) => t.annual))).toBeCloseTo(r.total, 2);
      expect(sum(mine.filter((t) => t.gl === "6030-8502").map((t) => t.annual))).toBeCloseTo(r.maintenance, 2);
    }
  });

  it("as pool blocks, each property's share comes back to its dollars", () => {
    const { blocks, entries } = payrollBudgetBlocks(targets, 2027);
    const lik = blocks.find((b) => b.gl === LIK_PAYROLL_GL)!;
    const months = allocatePool(lik, entries[lik.key].annual, "2010")!;
    expect(Math.abs(sum(months) - a.misc.find((m) => m.code === "2010")!.annual)).toBeLessThan(1);
  });
});
