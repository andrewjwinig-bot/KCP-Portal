import { describe, expect, it } from "vitest";
import { withLineOverride } from "./draft";

const sec = { name: "Residential Expenses", role: "residential-expense", lines: [] } as any;
const line = (subs = true): any => ({
  label: "Insurance", mask: "6410-*", months: new Array(12).fill(100), total: 1200, basisTotal: 1200, source: "items",
  subLines: subs ? [{ account: "Property", bucket: "base", months: new Array(12).fill(100), total: 1200, basisTotal: 1200 }] : undefined,
});

describe("whole-line override", () => {
  it("a typed month on a bucketed line stands, whatever its parts add to", () => {
    const months = new Array(12).fill(null); months[2] = 4800;
    const out = withLineOverride(sec, line(), { "Residential Expenses::Insurance#@line": { months } } as any);
    expect(out.months[2]).toBe(4800);
    expect(out.months[0]).toBe(100);
    expect(out.total).toBe(1100 + 4800);
    expect(out.lineOverride).toBe(true);
    expect(out.typed?.[2]).toBe(true);
  });
  it("leaves a line with no override, or no parts, alone", () => {
    expect(withLineOverride(sec, line(), {} as any).lineOverride).toBeUndefined();
    const months = new Array(12).fill(500);
    expect(withLineOverride(sec, line(false), { "Residential Expenses::Insurance#@line": { months } } as any).total).toBe(1200);
  });
});
