import { describe, it, expect } from "vitest";
import { closeMonthOf, periodMonth, sendsForMonth, payrollSendsIn, quarterOfMonth, closeOutStage } from "./monthCloseMath";

describe("month close", () => {
  it("works last month, in Eastern time", () => {
    expect(closeMonthOf(new Date("2026-11-10T17:00:00Z"))).toBe("2026-10");
    // 1am UTC on Dec 1 is still Nov 30 in Philadelphia.
    expect(closeMonthOf(new Date("2026-12-01T01:00:00Z"))).toBe("2026-10");
    expect(closeMonthOf(new Date("2027-01-05T15:00:00Z"))).toBe("2026-12");
  });
  it("reads every form a send's period is written in", () => {
    expect(periodMonth("2026-10")).toBe("2026-10");
    expect(periodMonth("October 2026")).toBe("2026-10");
    expect(periodMonth("Oct 2026")).toBe("2026-10");
    expect(periodMonth("2026-10-16")).toBe("2026-10");
    expect(periodMonth("10/16/2026")).toBe("2026-10");
    expect(periodMonth("2026-09_to_2026-10")).toBe("2026-10");
    expect(periodMonth("Q3 26")).toBeNull();
  });
  it("a partial send is not a send", () => {
    const s = [
      { source: "allocated", period: "2026-10", sentAt: "2026-11-03", total: 1, partial: true },
      { source: "allocated", period: "2026-09", sentAt: "2026-10-03", total: 1 },
    ];
    expect(sendsForMonth(s, "allocated", "2026-10")).toHaveLength(0);
    expect(sendsForMonth(s, "allocated", "2026-09")).toHaveLength(1);
  });
  it("payroll is the pay dates in the month", () => {
    const s = [
      { source: "payroll", period: "2026-10-30", sentAt: "2026-10-29", total: 1 },
      { source: "payroll", period: "2026-10-16", sentAt: "2026-10-15", total: 1 },
      { source: "payroll", period: "2026-11-13", sentAt: "2026-11-12", total: 1 },
    ];
    expect(payrollSendsIn(s, "2026-10").map((x) => x.period)).toEqual(["2026-10-16", "2026-10-30"]);
  });
  it("commissions only close at a quarter end", () => {
    expect(quarterOfMonth("2026-10")).toBeNull();
    const q = quarterOfMonth("2026-09")!;
    expect(q.label).toBe("Q3 26");
    expect(q.re.test("Q3 26")).toBe(true);
    expect(q.re.test("Q3-26")).toBe(true);
    expect(q.re.test("Q3 2026")).toBe(true);
    expect(q.re.test("Q2 26")).toBe(false);
  });
  it("says where a close-out stands", () => {
    const base = { maxPosted: 9, vacateMonth: 10, notifiedAt: null, approvedAt: null };
    expect(closeOutStage({ ...base, status: "waiting" }).text).toMatch(/Waiting on the Oct GL/);
    expect(closeOutStage({ ...base, status: "ready" }).text).toBe("Ready · send to Nancy");
    expect(closeOutStage({ ...base, status: "ready", kind: "retail" }).text).toBe("Ready · send to Harry");
    expect(closeOutStage({ ...base, status: "ready", notifiedAt: "2026-11-06T15:00:00Z" }).text).toBe("With Nancy since Nov 6");
    expect(closeOutStage({ ...base, status: "approved", approvedAt: "2026-11-09T15:00:00Z" }).rank).toBe(0);
  });
});
