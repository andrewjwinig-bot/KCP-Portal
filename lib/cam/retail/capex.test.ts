import { describe, it, expect } from "vitest";
import { capexByLabel, capexAmountIn, capexSchedule, capexTotal, sharesCapex, capexFor } from "./capex";

describe("amortized capital projects", () => {
  const lh = capexByLabel("9510", "Parking Lot Cap Ex")!;
  const bw = capexFor("2300")[0];

  it("9510's schedule is the team's: $489,842.54 at the start of 2025, cleared in 2038", () => {
    const s = capexSchedule(lh);
    expect(s[0]).toEqual({ year: 2025, amount: 35571, remaining: 454271.54 });
    expect(s.find((r) => r.year === 2037)!.remaining).toBe(27419.54);
    expect(s.at(-1)).toEqual({ year: 2038, amount: 27419.54, remaining: 0 });
    expect(capexAmountIn(lh, 2023)).toBe(8152);
    expect(capexAmountIn(lh, 2039)).toBe(0);
    // The package: invoices less engineering & fence, less what 2023–24 billed.
    expect(Math.round((lh.cost!.invoices - lh.cost!.less!.amount) * 100) / 100).toBe(lh.cost!.amortized);
    expect(Math.round((lh.cost!.amortized - 8152 - 35571) * 100) / 100).toBe(lh.openingBalance);
    expect(sharesCapex(lh, "9510-406")).toBe(false); // Wawa's lease excludes it
  });

  it("2300's runs 2026–2031 at $46,353.44, only for tenants there in 2021", () => {
    expect(capexAmountIn(bw, 2025)).toBe(0);
    expect(capexAmountIn(bw, 2027)).toBe(46353.44);
    expect(capexAmountIn(bw, 2032)).toBe(0);
    expect(capexTotal(bw)).toBe(278120.64);
    expect(sharesCapex(bw, "2300-1877", "10/20/20")).toBe(true);
    expect(sharesCapex(bw, "2300-1879", "03/01/27")).toBe(false);
    expect(sharesCapex(bw, "2300-1817", "01/01/66")).toBe(true);
    expect(sharesCapex(bw, "2300-1877", "12/10/21")).toBe(true); // in place the day it finished
    expect(sharesCapex(bw, "2300-1877", "12/15/21")).toBe(false);
  });
});
