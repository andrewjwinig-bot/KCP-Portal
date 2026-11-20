import { describe, expect, it } from "vitest";
import { payrollBlocks, poolAnnual, allocatePool } from "./payrollPools";

const alloc = (label: string, gl: string, total: number, rows: [string, number][], note = "From 2026 Payroll Budget") =>
  ({ propertyAmount: 0, sharePct: 0, portfolioTotal: total, basis: "sqft", blockLabel: label, glAccount: gl, sourceNote: note, rows: rows.map(([c, s]) => ({ propertyCode: c, sqft: 0, sharePct: s, months: [], total: 0 })) });
const prop = (code: string, allocations: any[]) => ({
  propertyCode: code, sections: [{ name: "X", lines: [{ label: "Maintenance Salaries", glAccount: "6030-8502", months: [], total: 0, allocations }] }],
}) as any;

describe("payroll pools", () => {
  const blocks = payrollBlocks([
    prop("2300", [alloc("Maintenance Salaries", "6030-8502", 109668, [["2300", 20.75], ["9510", 6.73]]), alloc("Marketing", "7110-8501", 45639, [["2300", 18.96]], "2025 amt grown 3%")]),
    prop("9510", [alloc("Maintenance Salaries", "6030-8502", 109668, [["2300", 20.75], ["9510", 6.73]])]),
  ]);
  it("reads the PAYROLL blocks once each, with every property's share", () => {
    expect(blocks.map((b) => b.label)).toEqual(["Maintenance Salaries"]);
    expect(blocks[0].shares).toEqual({ "2300": 20.75, "9510": 6.73 });
  });
  it("carries last year +3% until a total is entered", () => {
    expect(poolAnnual(blocks[0])).toEqual({ annual: 112958, entered: false });
    expect(poolAnnual(blocks[0], { annual: 120000 })).toEqual({ annual: 120000, entered: true });
  });
  it("gives each property its share, month by month, adding back exactly", () => {
    const m = allocatePool(blocks[0], 120000, "2300")!;
    expect(m.reduce((a, b) => a + b, 0)).toBe(24900);   // 20.75% of 120,000
    expect(allocatePool(blocks[0], 120000, "1100")).toBeNull();
  });
});
