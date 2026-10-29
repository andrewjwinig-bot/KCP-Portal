import { describe, it, expect } from "vitest";
import { isSignificantNotPosted, significantNotPosted } from "./notPosted";

const item = (line: string, section = "Operating Expenses", type: "not-posted" | "missing-debt" = "not-posted") =>
  ({ line, section, type });

describe("isSignificantNotPosted", () => {
  it("alerts on the big, easy-to-miss postings", () => {
    expect(isSignificantNotPosted(item("Management Fee"))).toBe(true);
    expect(isSignificantNotPosted(item("Insurance"))).toBe(true);
    expect(isSignificantNotPosted(item("Real Estate Taxes"))).toBe(true);
    expect(isSignificantNotPosted(item("R.E. Tax"))).toBe(true);
    expect(isSignificantNotPosted(item("Property Taxes"))).toBe(true);
    expect(isSignificantNotPosted(item("anything", "Debt Service", "missing-debt"))).toBe(true);
    expect(isSignificantNotPosted(item("Mortgage Interest"))).toBe(true);
  });

  it("stays quiet on routine monthly CAM lines", () => {
    expect(isSignificantNotPosted(item("Landscaping"))).toBe(false);
    expect(isSignificantNotPosted(item("Electric"))).toBe(false);
    expect(isSignificantNotPosted(item("Snow Removal"))).toBe(false);
    expect(isSignificantNotPosted(item("Repairs & Maintenance"))).toBe(false);
    expect(isSignificantNotPosted(item("Water & Sewer"))).toBe(false);
  });

  it("filters a mixed list down to the significant lines", () => {
    const items = [item("Landscaping"), item("Management Fee"), item("Electric"), item("Insurance")] as any;
    expect(significantNotPosted(items).map((i) => i.line)).toEqual(["Management Fee", "Insurance"]);
  });
});
