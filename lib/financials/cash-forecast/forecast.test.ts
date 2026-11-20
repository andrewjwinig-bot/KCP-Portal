import { describe, it, expect } from "vitest";
import { forecastLine, totalsOf, statementKeysFor } from "./forecast";
import { rollFromDate } from "@/lib/financials/budgets/cashForecast";

const flat = (n: number) => new Array(12).fill(n);

describe("forecastLine", () => {
  it("rolls month by month and lands where rollFromDate does", () => {
    const cashFlow = flat(30_000);
    const plan = new Array(12).fill(0); plan[9] = 100_000; plan[3] = 100_000;
    const line = forecastLine({ key: "4500", name: "Gray's Ferry", group: "Shopping Centers", balance: 500_000, asOf: "2026-09-10", cashFlow, plan }, 2026);
    expect(line.monthEnds.slice(0, 8).every((x) => x == null)).toBe(true);
    // September: 20 of 30 days remain → 20,000.
    expect(line.monthEnds[8]).toBe(520_000);
    // October pays the distribution.
    expect(line.monthEnds[9]).toBe(450_000);
    expect(line.monthEnds[11]).toBe(510_000);
    expect(line.distributionsRest).toBe(100_000);
    expect(line.yearEnd).toBe(rollFromDate(500_000, "2026-09-10", 2026, cashFlow, plan)!.yearEnd);
  });

  it("does not pay the as-of month's distribution twice when the GL shows it paid", () => {
    const plan = new Array(12).fill(0); plan[9] = 50_000;
    const paid = new Array(12).fill(0); paid[9] = -50_000;
    const l = forecastLine({ key: "x", name: "x", group: "g", balance: 100, asOf: "2026-10-20", cashFlow: flat(0), plan, paidOnGl: paid }, 2026);
    expect(l.distributionsRest).toBe(0);
    expect(l.yearEnd).toBe(100);
  });

  it("carries a line with no statement flat and says why", () => {
    const l = forecastLine({ key: "2010-CLR", name: "LIK Clearing", group: "Management", balance: 1_000, asOf: "2026-11-09", cashFlow: null }, 2026);
    expect(l.flat).toBe(true);
    expect(l.flatReason).toBe("No operating statement");
    expect(l.monthEnds[10]).toBe(1_000);
    expect(l.yearEnd).toBe(1_000);
  });
});

describe("totalsOf", () => {
  it("leaves tenant deposits out and fills a later-starting line at today's balance", () => {
    const a = forecastLine({ key: "a", name: "a", group: "g", balance: 1_000, asOf: "2026-10-31", cashFlow: flat(100) }, 2026);
    const b = forecastLine({ key: "b", name: "b", group: "g", balance: 500, asOf: "2026-11-30", cashFlow: flat(100) }, 2026);
    const sd = forecastLine({ key: "SD-1", name: "SD", group: "Tenant Security Deposits", balance: 9_999, asOf: "2026-11-09", cashFlow: null, restricted: true }, 2026);
    const t = totalsOf([a, b, sd]);
    expect(t.today).toBe(1_500);
    expect(t.monthEnds[9]).toBe(1_500); // b not started: today's 500
    expect(t.monthEnds[11]).toBe(1_200 + 600);
    expect(t.yearEnd).toBe(1_800);
  });
});

describe("statementKeysFor", () => {
  const m = new Set(["4500", "1500", "9200", "CONDO", "PJV3"]);
  it("maps bank lines to the statements that drive them", () => {
    expect(statementKeysFor("4500", m)).toEqual(["4500"]);
    expect(statementKeysFor("PJV3", m)).toEqual(["PJV3"]);
    expect(statementKeysFor("EASTWICK", m)).toEqual(["1500", "9200"]);
    expect(statementKeysFor("3610A", m)).toEqual(["CONDO"]);
    expect(statementKeysFor("SD-7216", m)).toEqual([]);
    expect(statementKeysFor("HKCO", m)).toEqual([]);
  });
});
