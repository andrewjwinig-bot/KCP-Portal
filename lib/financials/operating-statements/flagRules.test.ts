import { describe, it, expect } from "vitest";
import { seasonalTrendFlags, meetsFlagFloor, flagFloorFor, postsRegularly, FLAG_MIN_DOLLARS, LOOSE_FLAG_MIN_DOLLARS, marksPeriodUnposted, marksYtdUnposted, isDiscretionaryLine } from "./flagRules";

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
    expect(seasonalTrendFlags("reimbursable-expense", line(name), 7, actual, MOVED, actual - budget)).toEqual([]);
  });

  it("keeps the '?' on the line that actually matters", () => {
    // Parking Lot Maintenance: 28,350 against a 592 budget.
    expect(seasonalTrendFlags("reimbursable-expense", line("Parking Lot Maintenance"), 7, 28_350, MOVED, 28_350 - 592))
      .toEqual(MOVED);
  });

  it("treats the floor as inclusive, and reads the variance either way round", () => {
    expect(seasonalTrendFlags("reimbursable-expense", line("X"), 7, 1000, MOVED, FLAG_MIN_DOLLARS)).toEqual(MOVED);
    expect(seasonalTrendFlags("reimbursable-expense", line("X"), 7, 1000, MOVED, -FLAG_MIN_DOLLARS)).toEqual(MOVED);
    expect(seasonalTrendFlags("reimbursable-expense", line("X"), 7, 1000, MOVED, FLAG_MIN_DOLLARS - 1)).toEqual([]);
    // Favourable is still a variance — a line $4,000 UNDER budget is worth a look.
    expect(seasonalTrendFlags("reimbursable-expense", line("X"), 7, 1000, MOVED, -4000)).toEqual(MOVED);
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
    expect(seasonalTrendFlags("reimbursable-expense", line("Snow Removal", "6370-0000"), 7, 200, [], null)).toEqual([]);
  });

  it("still flags an off-season snow charge worth chasing", () => {
    expect(seasonalTrendFlags("reimbursable-expense", line("Snow Removal", "6370-0000"), 7, 5_000, [], null))
      .toEqual(["snow charge posted outside the Nov–Mar season — verify the GL coding"]);
  });

  it("expects a $0 RET month rather than flagging it", () => {
    expect(seasonalTrendFlags("reimbursable-expense", line("Real Estate Taxes", "6410-0000"), 7, 0, MOVED, null)).toEqual([]);
  });
});

describe("the floor is ONE number across the feature", () => {
  it("is what auto-explain uses too", async () => {
    // The "?" and the note must agree on what is too small to chase. Auto-explain
    // used to run on the RAW trend signal, so it would spend a note explaining a
    // line the statement had already decided not to mark.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/financials/operating-statements/analyze/route.ts", "utf8"));
    expect(src).toContain("FLAG_MIN_DOLLARS");
    expect(src).toContain("seasonalTrendFlags(");
    // …and it passes the line's variance in, or the floor would never bite.
    expect(src).toMatch(/l\.periodVariance,/);
  });
});

describe("where the ⚠ 'not posted' mark belongs", () => {
  const ytd = { scope: "ytd" as const };
  const debt = { scope: "period" as const };

  it("does NOT mark a month that budgeted nothing", () => {
    // Parking Lot Maintenance, July: ⚠ | 0. Nothing was expected that month,
    // nothing was posted, and the row carried a warning. The finding is about
    // the YEAR ($2,500 budgeted YTD), not about July.
    expect(marksPeriodUnposted(ytd, 0, 0)).toBe(false);
    expect(marksPeriodUnposted(ytd, 0, null)).toBe(false);
  });

  it("DOES mark a month that budgeted something and posted nothing", () => {
    expect(marksPeriodUnposted(ytd, 0, 1_391)).toBe(true);
  });

  it("marks the month for a DEBT signal regardless — that is about this month", () => {
    // The Debt Tracker schedules P&I for this month specifically.
    expect(marksPeriodUnposted(debt, 0, 0)).toBe(true);
  });

  it("never marks a month that actually posted something", () => {
    expect(marksPeriodUnposted(ytd, 1_155, 479)).toBe(false);
    expect(marksPeriodUnposted(debt, 4_200, 4_200)).toBe(false);
  });

  it("marks YTD only on a year with nothing posted at all", () => {
    expect(marksYtdUnposted(ytd, 0)).toBe(true);
    expect(marksYtdUnposted(ytd, 2_567)).toBe(false);
    expect(marksYtdUnposted(debt, 0)).toBe(false); // a debt signal is per-month
    expect(marksYtdUnposted(null, 0)).toBe(false);
  });
});

describe("a provision is not a commitment", () => {
  const L = (label: string) => ({ label, mask: "6500-*" });

  it.each([
    "Parking Lot Maintenance", "Building Maintenance", "General Repairs",
    "Plumbing Repairs", "Repaving", "Painting", "Signage",
    "Legal & Professional", "Bad Debt", "Misc Expense", "Roof Repairs",
  ])("treats %s as as-needed — a $0 year is a good year", (label) => {
    expect(isDiscretionaryLine(L(label))).toBe(true);
  });

  it.each([
    // These were going to be spent either way, so a $0 IS worth a look.
    "Electric", "Gas", "Water & Sewer", "Trash Removal", "Security",
    "Parking Lot Cleaning", "Insurance", "Real Estate Taxes",
    "Management Fee", "Elevator Service Contract", "Snow Removal",
  ])("keeps %s contractual", (label) => {
    expect(isDiscretionaryLine(L(label))).toBe(false);
  });

  it("lets CONTRACTUAL win where the words overlap", () => {
    // The difference between these three is one word.
    expect(isDiscretionaryLine(L("Maintenance Salaries"))).toBe(false); // payroll
    expect(isDiscretionaryLine(L("Parking Lot Cleaning"))).toBe(false); // a contract
    expect(isDiscretionaryLine(L("Parking Lot Maintenance"))).toBe(true); // as-needed
  });
});

describe("the looser floor for lines that swing by nature", () => {
  const L = (label: string) => ({ label, mask: "6500-*" });
  const MOVED2 = ["amount differs sharply from recent months"];

  it("holds the two as-needed lines the owner named to the loose floor", () => {
    for (const n of ["Building Maintenance", "Parking Lot Maintenance"]) {
      expect(meetsFlagFloor(LOOSE_FLAG_MIN_DOLLARS - 1, L(n))).toBe(false);
      expect(meetsFlagFloor(LOOSE_FLAG_MIN_DOLLARS, L(n))).toBe(true);
    }
  });

  it("leaves a fixed line on the tight floor", () => {
    expect(meetsFlagFloor(FLAG_MIN_DOLLARS, L("Security"))).toBe(true);
    expect(meetsFlagFloor(FLAG_MIN_DOLLARS - 1, L("Security"))).toBe(false);
  });

  it("still flags an as-needed overrun that is genuinely large", () => {
    expect(seasonalTrendFlags("reimbursable-expense", L("Parking Lot Maintenance"), 7, 28_350, MOVED2, 27_758)).toEqual(MOVED2);
  });

  it("falls back to the tight floor when the caller has no line", () => {
    // An unknown line is held to the stricter bar — under-flagging a fixed cost
    // is the worse error.
    expect(meetsFlagFloor(FLAG_MIN_DOLLARS)).toBe(true);
  });
});

describe("landscaping depends on the property, so the ledger decides", () => {
  const LAND = { label: "Landscaping" };
  // A contract: posted every month.
  const CONTRACT = [1_143, 1_147, 1_155, 1_158, 1_150, 1_146, 1_155];
  // Call-someone-when-it-needs-cutting: three months out of seven.
  const AS_NEEDED = [0, 2_100, 0, 0, 1_800, 0, 1_155];

  it("holds a contracted landscaping line to the TIGHT floor", () => {
    expect(postsRegularly(CONTRACT)).toBe(true);
    expect(flagFloorFor(LAND, CONTRACT)).toBe(FLAG_MIN_DOLLARS);
  });

  it("holds an as-needed landscaping line to the LOOSE floor", () => {
    expect(postsRegularly(AS_NEEDED)).toBe(false);
    expect(flagFloorFor(LAND, AS_NEEDED)).toBe(LOOSE_FLAG_MIN_DOLLARS);
  });

  it("says it cannot tell from fewer than three months", () => {
    expect(postsRegularly([1_150, 1_155])).toBeNull();
    expect(postsRegularly(undefined)).toBeNull();
    // …and falls to the loose floor, because the direction here is less noise.
    expect(flagFloorFor(LAND, [1_150, 1_155])).toBe(LOOSE_FLAG_MIN_DOLLARS);
  });

  it("never lets history loosen an unambiguously fixed line", () => {
    // Electric is a bill whatever its posting pattern looks like.
    expect(flagFloorFor({ label: "Electric" }, AS_NEEDED)).toBe(FLAG_MIN_DOLLARS);
  });

  it("never lets history tighten an unambiguously as-needed line", () => {
    expect(flagFloorFor({ label: "Parking Lot Maintenance" }, CONTRACT)).toBe(LOOSE_FLAG_MIN_DOLLARS);
  });
});
