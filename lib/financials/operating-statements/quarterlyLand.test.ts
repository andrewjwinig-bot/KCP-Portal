import { describe, it, expect } from "vitest";
import { expectedPostedThroughFor } from "./postingSchedule";

// The land holdings import QUARTERLY (owner, 10/2026): they owe a GL through
// the last completed quarter, everything else through the prior month.
describe("expectedPostedThroughFor", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  it("a monthly statement owes the prior month", () => {
    expect(expectedPostedThroughFor("9510", at("2026-11-10"))).toEqual({ year: 2026, period: 10 });
  });
  it("a land statement owes the last quarter end", () => {
    expect(expectedPostedThroughFor("0800", at("2026-10-21"))).toEqual({ year: 2026, period: 9 });
    expect(expectedPostedThroughFor("2070", at("2026-11-10"))).toEqual({ year: 2026, period: 9 });
    expect(expectedPostedThroughFor("0900", at("2026-12-10"))).toEqual({ year: 2026, period: 9 });
    expect(expectedPostedThroughFor("2040", at("2027-01-10"))).toEqual({ year: 2026, period: 12 });
    expect(expectedPostedThroughFor("2080", at("2027-03-10"))).toEqual({ year: 2026, period: 12 });
    expect(expectedPostedThroughFor("0800", at("2027-04-10"))).toEqual({ year: 2027, period: 3 });
  });
});
