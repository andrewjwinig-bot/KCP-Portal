import { describe, expect, it } from "vitest";
import { canonicalQuarter, recentQuarterLabels, termYearsMonths } from "@/lib/commissions";
import { priorQuarterLabel, sentRecordFor } from "./sendQuarterToAvidBill";

describe("quarter labels", () => {
  it("the cron asks for the quarter in the label the pages save", () => {
    // It asked for "3rd Quarter 2026" and matched entries saved "Q3 26"
    // exactly — so it found none and sent nothing.
    const oct = new Date(2026, 9, 5);
    expect(priorQuarterLabel(oct)).toBe("Q3 26");
    expect(recentQuarterLabels(2, oct)[1]).toBe(priorQuarterLabel(oct));
    expect(priorQuarterLabel(new Date(2027, 0, 2))).toBe("Q4 26");
  });
  it("both shapes canonicalize, and an old long-keyed record is still found", () => {
    expect(canonicalQuarter("3rd Quarter 2026")).toBe("Q3 26");
    expect(canonicalQuarter("Q3 26")).toBe("Q3 26");
    expect(sentRecordFor({ "3rd Quarter 2026": 1 }, "Q3 26")).toBe(1);
    expect(sentRecordFor({ "Q2 26": 1 }, "Q3 26")).toBeUndefined();
  });
  it("a budget lease term reads to the month", () => {
    expect(termYearsMonths(53 / 12)).toBe("4 yr 5 mo");
    expect(termYearsMonths(5)).toBe("5 yr");
    expect(termYearsMonths(0.5)).toBe("6 mo");
    expect(termYearsMonths(undefined)).toBe("");
  });
});
