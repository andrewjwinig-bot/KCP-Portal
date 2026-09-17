import { describe, it, expect } from "vitest";
import { seasonalTrendFlags, meetsFlagFloor, FLAG_MIN_DOLLARS } from "./flagRules";

const line = (label: string, mask = "6500-*") => ({ label, mask });
const MOVED = ["amount differs sharply from recent months"];

describe("the variance floor on a '?'", () => {
  // 9510's July statement, which is what prompted the floor. Three lines
  // carried a "?" for having moved, while sitting on budget; the one line that
  // mattered carried the same mark and no more weight.
  const july9510 = [
    { name: "Maintenance Salaries", actual: 577, budget: 615 },
    { name: "Building Maintenance", actual: 422, budget: 500 },
    { name: "Landscaping", actual: 212, budget: 515 },
  ];

  it.each(july9510)("drops the '?' on $name ($actual vs $budget)", ({ name, actual, budget }) => {
    expect(seasonalTrendFlags("opex", line(name), 7, actual, MOVED, actual - budget)).toEqual([]);
  });

  it("keeps the '?' on the line that actually matters", () => {
    // Parking Lot Maintenance: 28,350 against a 592 budget.
    expect(seasonalTrendFlags("opex", line("Parking Lot Maintenance"), 7, 28_350, MOVED, 28_350 - 592))
      .toEqual(MOVED);
  });

  it("treats the floor as inclusive, and reads the variance either way round", () => {
    expect(seasonalTrendFlags("opex", line("X"), 7, 1000, MOVED, FLAG_MIN_DOLLARS)).toEqual(MOVED);
    expect(seasonalTrendFlags("opex", line("X"), 7, 1000, MOVED, -FLAG_MIN_DOLLARS)).toEqual(MOVED);
    expect(seasonalTrendFlags("opex", line("X"), 7, 1000, MOVED, FLAG_MIN_DOLLARS - 1)).toEqual([]);
    // Favourable is still a variance — a line $4,000 UNDER budget is worth a look.
    expect(seasonalTrendFlags("opex", line("X"), 7, 1000, MOVED, -4000)).toEqual(MOVED);
  });
});

describe("meetsFlagFloor", () => {
  it("lets an UNBUDGETED line through", () => {
    // There is no variance to measure, so the trend checks' own $500 floor is
    // the gate. Suppressing here instead would mean an unbudgeted line could
    // never be flagged at all — the opposite of what the floor is for.
    expect(meetsFlagFloor(null)).toBe(true);
    expect(meetsFlagFloor(undefined)).toBe(true);
    expect(meetsFlagFloor(NaN)).toBe(true);
  });

  it("measures the variance in dollars, not percent", () => {
    // 577 vs 615 is -6.2% and $38. The percentage is not the question.
    expect(meetsFlagFloor(-38)).toBe(false);
    expect(meetsFlagFloor(27_758)).toBe(true);
  });
});

describe("the seasonal rules still apply", () => {
  it("never flags capital, whatever the variance", () => {
    expect(seasonalTrendFlags("capital", line("Roof"), 7, 90_000, MOVED, 90_000)).toEqual([]);
  });

  it("ignores an off-season snow charge too small to chase", () => {
    // The rule is about mis-coding, but the floor is the floor: nobody opens
    // the GL over $200 of July snow.
    expect(seasonalTrendFlags("opex", line("Snow Removal", "6370-0000"), 7, 200, [], null)).toEqual([]);
  });

  it("still flags an off-season snow charge worth chasing", () => {
    expect(seasonalTrendFlags("opex", line("Snow Removal", "6370-0000"), 7, 5_000, [], null))
      .toEqual(["snow charge posted outside the Nov–Mar season — verify the GL coding"]);
  });

  it("expects a $0 RET month rather than flagging it", () => {
    expect(seasonalTrendFlags("opex", line("Real Estate Taxes", "6410-0000"), 7, 0, MOVED, null)).toEqual([]);
  });
});
