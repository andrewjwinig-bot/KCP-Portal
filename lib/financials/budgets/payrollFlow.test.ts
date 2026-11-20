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

  it("4900 Office Works: OW Direct → Secretarial Salaries 6030-8502, OW Indirect → Supervisory Salaries 6010-8501", () => {
    const d = seedPayrollBudget(2027);
    d.employees[0] = { ...d.employees[0], alloc: { owDirect: 50, owIndirect: 50 } };
    const al = allocatePayroll(d);
    const ow = payrollTargets(al).filter((t) => t.code === "4900");
    expect(ow.find((t) => t.gl === "6030-8502")?.annual).toBeCloseTo(al.byEntity.owDirect.total, 2);
    expect(ow.find((t) => t.gl === "6010-8501")?.annual).toBeCloseTo(al.byEntity.owIndirect.total, 2);
    expect(ow.find((t) => t.gl === "6030-8502")?.label).toBe("Secretarial Salaries");
  });
});

describe("auto allowances land as their own row", () => {
  it("splits each property's allowance out of its salary dollars, adding back to the whole", async () => {
    const { withAutoAllowances } = await import("./payrollBudget");
    const { payrollTargetsOf, AUTO_ALLOWANCE_LABEL } = await import("./payrollFlow");
    const doc = withAutoAllowances(seedPayrollBudget(2027));
    const t = payrollTargetsOf(doc);
    const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
    expect(sum(t.map((x) => x.annual))).toBeCloseTo(allocatePayroll(doc).allocated, 1);
    const auto = t.filter((x) => x.auto);
    expect(auto.every((x) => x.label === AUTO_ALLOWANCE_LABEL)).toBe(true);
    // Drew's $7,200 + the FICA / Medicare on it, across where he is allocated.
    expect(sum(auto.map((x) => x.annual))).toBeCloseTo(7200 * (1 + 0.062 + 0.0145), 0);
    expect(auto.find((x) => x.code === "2010")?.gl).toBe(LIK_PAYROLL_GL);
    // Blocks lay the allowance LAST, onto a line its salary block already set.
    const { blocks } = payrollBudgetBlocks(t, 2027);
    const firstAuto = blocks.findIndex((b) => b.label === AUTO_ALLOWANCE_LABEL);
    expect(firstAuto).toBeGreaterThan(0);
    expect(blocks.slice(firstAuto).every((b) => b.label === AUTO_ALLOWANCE_LABEL)).toBe(true);
  });
});
