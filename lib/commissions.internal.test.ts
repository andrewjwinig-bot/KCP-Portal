import { describe, expect, it } from "vitest";
import { internalCommission } from "./commissions";

describe("internalCommission", () => {
  it("pays Harry $1/SF at a shopping centre, whatever the term", () => {
    expect(internalCommission("SC", 2500, undefined)).toBe(2500);
  });
  it("pays Nancy by term at a business park, the highest tier reached", () => {
    expect(internalCommission("BP", 1000, 5)).toBe(360);
    expect(internalCommission("BP", 1000, 3)).toBe(300);
    expect(internalCommission("BP", 1000, 10)).toBe(360);   // past 5 years: the 5-year rate
    expect(internalCommission("BP", 1000, undefined)).toBe(0);
  });
  it("Korman Homes (no allocation group) budgets no internal commission", () => {
    expect(internalCommission(undefined, 1600, 1)).toBe(0);
    expect(internalCommission("KH", 1600, 1)).toBe(0);
  });
});
