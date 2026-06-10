import { describe, it, expect } from "vitest";
import {
  wednesdaysInMonth, priorMonth, monthKey, parseMonthKey,
  operationalCash, totalBills, cashSheetGroups, cashSheetCodes, cashSheetFundCodes, bankAccountsForCodes, wednesdayLabel,
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

  it("computes operational cash = starting − bills − reserves", () => {
    const row = { reserves: 5, bills: { "2026-02-04": 10, "2026-02-11": 20 } };
    expect(totalBills(row)).toBe(30);
    expect(operationalCash(100, row)).toBe(65);
    // No starting cash yet → null (can't net).
    expect(operationalCash(null, row)).toBeNull();
    // No row → starting passes through.
    expect(operationalCash(100, undefined)).toBe(100);
  });

  it("groups operating properties by fund and excludes holding/condo entities", () => {
    const groups = cashSheetGroups();
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    // Management leads; Land trails; holding/condo entities still excluded.
    expect(groups.map((g) => g.id)).toEqual(["mgmt", "jv3", "nillc", "sc", "ow", "kh", "land"]);

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
