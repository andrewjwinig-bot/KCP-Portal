import { describe, it, expect } from "vitest";
import { reconcilePayroll } from "./tieOut";
import type { AllocationTable, PayrollParseResult, PropertyInvoice } from "@/lib/types";

const emp = (name: string, salaryAmt: number, extra: Partial<PayrollParseResult["employees"][number]> = {}) =>
  ({ name, salaryAmt, overtimeAmt: 0, overtimeHours: 0, holAmt: 0, holHours: 0, er401kAmt: 0, otherAmt: 0, taxesErAmt: 0, ...extra });

const alloc = (names: { name: string; top: Record<string, number> }[]): AllocationTable => ({
  employees: names.map((n) => ({ name: n.name, recoverable: false, top: n.top })),
  prs: { salaryREC: {}, salaryNR: {} },
  propertyMeta: {},
});

const inv = (total: number): PropertyInvoice => ({ propertyKey: "p", propertyLabel: "p", payDate: "", invoiceNumber: "", lines: [], total } as any);

describe("reconcilePayroll", () => {
  it("ties when every employee is matched and fully allocated", () => {
    const payroll = { payDate: "", employees: [emp("Alice", 1000), emp("Bob", 500)], totals: {} as any };
    const a = alloc([{ name: "Alice", top: { "1100": 1 } }, { name: "Bob", top: { "1100": 1 } }]);
    const t = reconcilePayroll(payroll as any, a, [inv(1500)]);
    expect(t.sourceTotal).toBe(1500);
    expect(t.allocatedTotal).toBe(1500);
    expect(t.unmatched).toHaveLength(0);
    expect(t.ties).toBe(true);
  });

  it("flags an unmatched employee whose pay lands nowhere", () => {
    const payroll = { payDate: "", employees: [emp("Alice", 1000), emp("Ghost", 400)], totals: {} as any };
    const a = alloc([{ name: "Alice", top: { "1100": 1 } }]); // no row for Ghost
    const t = reconcilePayroll(payroll as any, a, [inv(1000)]);
    expect(t.unmatched).toEqual([{ name: "Ghost", employeeId: undefined, amount: 400 }]);
    expect(t.unmatchedTotal).toBe(400);
    expect(t.delta).toBe(400);
    expect(t.unexplained).toBe(400); // unmatched IS the whole gap → still doesn't "tie" clean
    expect(t.ties).toBe(false);
  });

  it("flags an employee whose allocation doesn't sum to 100%", () => {
    const payroll = { payDate: "", employees: [emp("Alice", 1000)], totals: {} as any };
    const a = alloc([{ name: "Alice", top: { "1100": 0.8 } }]); // only 80%
    const t = reconcilePayroll(payroll as any, a, [inv(800)]);
    const off = t.offAllocation.find((o) => o.name === "Alice")!;
    expect(off.pctSum).toBeCloseTo(0.8);
    expect(off.shortfall).toBe(200);
    expect(off.accepted).toBe(false);
  });

  it("treats Harry Feldman's ~94.86% as an accepted variance (doesn't break the tie)", () => {
    const payroll = { payDate: "", employees: [emp("Harry Feldman", 10000)], totals: {} as any };
    const a = alloc([{ name: "Harry Feldman", top: { "1100": 0.9486 } }]);
    const t = reconcilePayroll(payroll as any, a, [inv(9486)]);
    const off = t.offAllocation.find((o) => /feldman/i.test(o.name))!;
    expect(off.accepted).toBe(true);
    expect(t.ties).toBe(true); // accepted shortfall explains the gap
  });

  it("counts commissions as excluded, not as a leak", () => {
    const payroll = { payDate: "", employees: [emp("Alice", 1000, { exclusions: [{ label: "Commission", amount: 300 }] })], totals: {} as any };
    const a = alloc([{ name: "Alice", top: { "1100": 1 } }]);
    const t = reconcilePayroll(payroll as any, a, [inv(1000)]);
    expect(t.excludedTotal).toBe(300);
    expect(t.sourceTotal).toBe(1000); // commission NOT in allocatable comp
    expect(t.ties).toBe(true);
  });
});
