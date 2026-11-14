import { describe, it, expect } from "vitest";
import { billingFlagReason } from "./rentCheckRun";
import { rentCheck, type RentCheckUnit } from "./rentCheck";
import { FLAG_MIN_DOLLARS } from "./flagRules";

const unit = (over: Partial<RentCheckUnit> & { unitRef: string }): RentCheckUnit => ({
  tenant: "Tenant", isVacant: false, sqft: 1000, baseRent: 0,
  opexMonth: 0, reTaxMonth: 0, otherMonth: 0,
  leaseFrom: "01/01/2020", leaseTo: "12/31/2030", ...over,
});

const run = (units: RentCheckUnit[], billedByUnit: Record<string, number>) =>
  rentCheck({ year: 2026, period: 7, scope: "month", units, billedByUnit, basis: "cam" });

describe("the billing '?' on a statement line", () => {
  it("SAYS NOTHING when every suite ties", () => {
    // The whole point. A line that reconciles perfectly must not carry a mark.
    const res = run(
      [unit({ unitRef: "4500-2851", opexMonth: 1550 }), unit({ unitRef: "4500-3021", opexMonth: 23100 })],
      { "4500-2851": 1550, "4500-3021": 23100 },
    );
    expect(billingFlagReason(res, "cam", FLAG_MIN_DOLLARS)).toBeNull();
  });

  it("says nothing when a suite owes nothing and was billed nothing", () => {
    const res = run([unit({ unitRef: "4500-3007", tenant: "Pennsylvania LCB", opexMonth: 0 })], {});
    expect(billingFlagReason(res, "cam", FLAG_MIN_DOLLARS)).toBeNull();
  });

  it("names the tenants that don't tie, worst first, with the column", () => {
    const res = run(
      [
        unit({ unitRef: "9510-406", tenant: "Wawa", opexMonth: 7917 }),
        unit({ unitRef: "9510-420", tenant: "Lafayette Hill Cleaners", opexMonth: 3668 }),
        unit({ unitRef: "9510-412", tenant: "Touch of Class", opexMonth: 2739 }),
      ],
      { "9510-420": 1223, "9510-412": 854 }, // Wawa billed nothing at all
    );
    const reason = billingFlagReason(res, "cam", FLAG_MIN_DOLLARS)!;
    expect(reason).toContain("3 suites do not tie");
    expect(reason).toContain("CAM column");
    // Worst first: Wawa's whole charge is missing.
    expect(reason.indexOf("Wawa")).toBeLessThan(reason.indexOf("Lafayette"));
    expect(reason).toContain("Wawa (not billed $7,917)");
    expect(reason).toContain("Touch of Class (short $1,885)");
  });

  it("holds to the house floor, so a rounding difference is not a trip", () => {
    const res = run([unit({ unitRef: "9510-406", tenant: "Wawa", opexMonth: 7917 })], { "9510-406": 7900 });
    expect(billingFlagReason(res, "cam", FLAG_MIN_DOLLARS)).toBeNull();
  });

  it("clears the floor on the TOTAL, not per suite — a rate change nobody applied", () => {
    // Nine suites $60 short each is $540: no single one is worth a trip and
    // the pattern very much is. A per-suite floor would never see it.
    const units = Array.from({ length: 9 }, (_, i) => unit({ unitRef: `9510-${400 + i}`, tenant: `T${i}`, opexMonth: 600 }));
    const billed = Object.fromEntries(units.map((u) => [u.unitRef, 540]));
    const reason = billingFlagReason(run(units, billed), "cam", FLAG_MIN_DOLLARS)!;
    expect(reason).toContain("9 suites do not tie");
    expect(reason).toContain("and 5 more");
  });

  it("does not flag a lease that starts mid-window — that charge is prorated", () => {
    const res = rentCheck({
      year: 2026, period: 7, scope: "month", basis: "cam",
      units: [unit({ unitRef: "9510-414", tenant: "New Tenant", opexMonth: 4000, leaseFrom: "07/15/2026" })],
      billedByUnit: { "9510-414": 2000 },
    });
    expect(billingFlagReason(res, "cam", FLAG_MIN_DOLLARS)).toBeNull();
  });
});
