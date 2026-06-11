import { describe, it, expect } from "vitest";
import {
  wednesdaysInMonth, priorMonth, monthKey, parseMonthKey,
  operationalCash, totalBills, cashSheetGroups, cashSheetCodes, cashSheetFundCodes, bankAccountsForCodes,
  wednesdayLabel, weekOfLabel, visibleWednesdays,
} from "./util";

describe("cash-sheet util", () => {
  it("finds every Wednesday in a month", () => {
    // Feb 2026 starts on a Sunday → Wednesdays land on the 4th, 11th, 18th, 25th.
    expect(wednesdaysInMonth(2026, 2)).toEqual(["2026-02-04", "2026-02-11", "2026-02-18", "2026-02-25"]);
    // A 5-Wednesday month: July 2026 (Jul 1 2026 is a Wednesday).
    expect(wednesdaysInMonth(2026, 7)).toEqual(["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"]);
  });

  it("labels a Wednesday compactly", () => {
    expect(wednesdayLabel("2026-02-04")).toBe("Wed 2/4");
    expect(wednesdayLabel("2026-12-30")).toBe("Wed 12/30");
    expect(weekOfLabel("2026-06-10")).toBe("Week of 6/10");
  });

  it("hides Wednesdays whose week hasn't started yet", () => {
    const weds = ["2026-06-03", "2026-06-10", "2026-06-17", "2026-06-24"];
    // On Thu 6/11 the week of 6/10 is current; 6/17 and 6/24 are future weeks.
    expect(visibleWednesdays(weds, new Date(2026, 5, 11))).toEqual(["2026-06-03", "2026-06-10"]);
    // A week appears on its Monday: the week of 6/17 opens Mon 6/15.
    expect(visibleWednesdays(weds, new Date(2026, 5, 15))).toEqual(["2026-06-03", "2026-06-10", "2026-06-17"]);
    // A past month shows them all; a future month none.
    expect(visibleWednesdays(weds, new Date(2026, 11, 1))).toEqual(weds);
    expect(visibleWednesdays(weds, new Date(2026, 0, 1))).toEqual([]);
  });

  it("rolls the prior month across the year boundary", () => {
    expect(priorMonth(2026, 2)).toEqual({ year: 2026, month: 1 });
    expect(priorMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
  });

  it("round-trips month keys", () => {
    expect(monthKey(2026, 3)).toBe("2026-03");
    expect(parseMonthKey("2026-03")).toEqual({ year: 2026, month: 3 });
    expect(parseMonthKey("nope")).toBeNull();
    expect(parseMonthKey("2026-13")).toBeNull();
  });

  it("computes operational cash = starting + revenue − bills − reserves", () => {
    const row = { reserves: 5, bills: { "2026-02-04": 10, "2026-02-11": 20 } };
    expect(totalBills(row)).toBe(30);
    // No revenue (default) → starting − bills − reserves.
    expect(operationalCash(100, row)).toBe(65);
    // With anticipated revenue the inflow is added: 100 + 50 − 30 − 5.
    expect(operationalCash(100, row, 50)).toBe(115);
    // No starting cash yet → null (can't net), even with revenue.
    expect(operationalCash(null, row, 50)).toBeNull();
    // No row → starting + revenue passes through.
    expect(operationalCash(100, undefined, 40)).toBe(140);
  });

  it("groups operating properties by fund and excludes holding/condo entities", () => {
    const groups = cashSheetGroups();
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    // Management leads; the JV III Condo follows JV III; Land trails.
    expect(groups.map((g) => g.id)).toEqual(["mgmt", "jv3", "condo", "nillc", "sc", "ow", "kh", "land"]);
    expect(byId.condo.properties.map((p) => p.code)).toEqual(["CONDO"]);

    const codes = cashSheetCodes();
    // Shopping centers + The Office Works (4900) + Management (2010) + Land present;
    // condo (3610A) + NI LLC holding (4000) excluded.
    expect(codes).toContain("1100");
    expect(codes).toContain("4900");
    expect(codes).toContain("2010");
    expect(codes).toContain("0800"); // Land now tracked
    expect(codes).not.toContain("3610A");
    expect(codes).not.toContain("4000");
    // JV III is exactly the three buildings.
    expect(byId.jv3.properties.map((p) => p.code)).toEqual(["3610", "3620", "3640"]);
    // Land carries the land entities (with bank accounts).
    expect(byId.land.properties.map((p) => p.code)).toEqual(expect.arrayContaining(["0300", "0800"]));
  });

  it("resolves bank accounts for a row, deduped across a pooled fund's buildings", () => {
    // JV III's three buildings share one account (x5631) → a single chip.
    expect(bankAccountsForCodes(["3610", "3620", "3640"]).map((a) => a.last4)).toEqual(["x5631"]);
    // A per-property row returns its own account(s).
    expect(bankAccountsForCodes(["0800"]).map((a) => a.last4)).toEqual(["x8822"]);
  });

  it("marks the pooled funds (one bank account) with their fund GL code", () => {
    const byId = Object.fromEntries(cashSheetGroups().map((g) => [g.id, g]));
    // JV III + NI LLC pool into one fund account each.
    expect(byId.jv3.fundCashCode).toBe("PJV3");
    expect(byId.nillc.fundCashCode).toBe("PNIPLX");
    // Shopping centers + homes are per-property (no shared fund account).
    expect(byId.sc.fundCashCode).toBeUndefined();
    expect(byId.kh.fundCashCode).toBeUndefined();
    expect(cashSheetFundCodes().sort()).toEqual(["PJV3", "PNIPLX"]);
  });
});
