import { describe, it, expect } from "vitest";
import { glAnnualForSpec } from "./loadResult";
import type { StoredGl } from "@/lib/financials/operating-statements/statementStore";

// A minimal StoredGl — glAnnualForSpec only reads `monthly` (account → 12 nets).
function gl(monthly: Record<string, number[]>): StoredGl {
  return { monthly } as unknown as StoredGl;
}
const flat = (n: number) => Array(12).fill(n); // $n each month → $12n annual

describe("glAnnualForSpec — retail expense sourcing from the operating-statement GL", () => {
  const sample = gl({
    "6380-8502": flat(100), // 1200/yr
    "6380-8501": flat(50),  // 600/yr  (office suffix)
    "6360-8501": flat(10),  // 120/yr
    "6360-8502": flat(20),  // 240/yr
    "6030-8502": flat(200), // 2400/yr
  });

  it("returns null when there's no GL or no GL account (a '—' line keeps its seed)", () => {
    expect(glAnnualForSpec(null, "6380-8502")).toBeNull();
    expect(glAnnualForSpec(sample, "—")).toBeNull();
    expect(glAnnualForSpec(sample, "")).toBeNull();
  });

  it("sums a single account's 12 monthly nets", () => {
    expect(glAnnualForSpec(sample, "6030-8502")).toBe(2400);
    expect(glAnnualForSpec(sample, "6380-8502")).toBe(1200);
  });

  it("sums a comma-list of accounts", () => {
    expect(glAnnualForSpec(sample, "6380-8502,6380-8501")).toBe(1800);
  });

  it("sums a wildcard mask across suffixes", () => {
    expect(glAnnualForSpec(sample, "6360-*")).toBe(360);
  });

  it("returns 0 for a real account that simply hasn't posted", () => {
    expect(glAnnualForSpec(sample, "6270-8502")).toBe(0);
  });
});
