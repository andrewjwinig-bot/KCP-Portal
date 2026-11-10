import { describe, expect, it } from "vitest";
import { closedThrough } from "./glAssemble";

// 1100, 11/2026: a GL exported Oct 21 with a Jan–Oct range read "posted
// through October", so the Time to post October reminder never showed.
describe("closedThrough", () => {
  const g = { coverageEnd: 10, maxPeriodInFile: 10 };
  it("never counts a month that had not ended at import", () => {
    expect(closedThrough(g, 2026, [{ uploadedAt: "2026-10-21T13:17:00Z" }])).toBe(9);
  });
  it("counts the month once it has ended", () => {
    expect(closedThrough(g, 2026, [{ uploadedAt: "2026-11-04T15:00:00Z" }])).toBe(10);
  });
  it("judges the import date in Eastern time", () => {
    // 00:30 UTC on Nov 1 is still Oct 31 in Philadelphia.
    expect(closedThrough(g, 2026, [{ uploadedAt: "2026-11-01T00:30:00Z" }])).toBe(9);
  });
  it("takes the newest file of the year", () => {
    expect(closedThrough(g, 2026, [{ uploadedAt: "2026-10-21T13:00:00Z" }, { uploadedAt: "2026-11-05T13:00:00Z" }])).toBe(10);
  });
  it("leaves a past year imported later alone", () => {
    expect(closedThrough({ maxPeriodInFile: 12 }, 2025, [{ uploadedAt: "2026-02-01T13:00:00Z" }])).toBe(12);
  });
  it("leaves a file with no stamp alone", () => {
    expect(closedThrough(g, 2026, [{}])).toBe(10);
  });
});
