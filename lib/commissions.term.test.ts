import { describe, it, expect } from "vitest";
import { termMonthsBetween, renewalEndISOMonths, incentiveTier, computeIncentive, formatTerm } from "./commissions";

describe("commission terms in months (owner: \"like 6 months, or 38 months\")", () => {
  it("sets Lease To from a month term", () => {
    expect(renewalEndISOMonths("2027-06-01", 38)).toBe("2030-07-31");
    expect(renewalEndISOMonths("2027-06-01", 6)).toBe("2027-11-30");
    expect(renewalEndISOMonths("2027-06-01", 60)).toBe("2032-05-31");
  });
  it("reads the months back off the dates", () => {
    expect(termMonthsBetween("2027-06-01", "2030-07-31")).toBe(38);
    expect(termMonthsBetween("2027-06-01", "2027-11-30")).toBe(6);
    expect(termMonthsBetween("06/01/2027", "05/31/2032")).toBe(60);
  });
  it("a term between the standard ones takes the highest tier reached", () => {
    expect(incentiveTier(38 / 12)?.years).toBe(3);
    expect(incentiveTier(0.5)?.ratePerSqft).toBe(0.075);
    expect(incentiveTier(5 / 12)).toBeNull();
    expect(computeIncentive(38 / 12, 612)).toBeCloseTo(183.6, 2);
  });
  it("formats whole years as years, the rest as months", () => {
    expect(formatTerm(3)).toBe("3 yr");
    expect(formatTerm(38 / 12)).toBe("38 mo");
    expect(formatTerm(0.5)).toBe("6 mo");
  });
});
