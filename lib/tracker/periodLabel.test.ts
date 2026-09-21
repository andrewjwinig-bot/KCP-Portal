import { describe, it, expect } from "vitest";
import { periodPill } from "./periodLabel";

describe("the period pill", () => {
  it("reads a payroll pay DATE", () => {
    expect(periodPill("09/07/2026")).toBe("SEP");
    expect(periodPill("12/31/2026")).toBe("DEC");
  });

  it("reads a credit-card statement RANGE, and collapses one month to itself", () => {
    // The 3rd to the 31st of August is an AUGUST statement, not a range.
    expect(periodPill("Aug 03, 2026 to Aug 31, 2026")).toBe("AUG");
    expect(periodPill("Dec 28, 2026 to Jan 27, 2027")).toBe("DEC–JAN");
  });

  it("reads an allocated-run KEY", () => {
    expect(periodPill("2026-01_to_2026-06")).toBe("JAN–JUN");
    expect(periodPill("2026-09")).toBe("SEP");
  });

  it("returns NULL rather than guessing", () => {
    // A pill reading the wrong month is worse than one reading "SAVED" — the
    // whole point of the period being there is to trust it at a glance.
    expect(periodPill("Saved batch")).toBeNull();
    expect(periodPill("Last run")).toBeNull();
    expect(periodPill("")).toBeNull();
    expect(periodPill(null)).toBeNull();
    expect(periodPill("Nothing saved yet")).toBeNull();
  });

  it("does not read a bare year or a stray number as a month", () => {
    expect(periodPill("2026")).toBeNull();
    expect(periodPill("33 transactions")).toBeNull();
  });
});
