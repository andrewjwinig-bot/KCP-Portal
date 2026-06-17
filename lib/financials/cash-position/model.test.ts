import { describe, it, expect } from "vitest";
import {
  netAvailable, weekEndingFriday, shiftWeek, cashPositionCodes,
  CASH_POSITION_GROUPS, CASH_POSITION_BUCKETS,
} from "./model";

describe("cash-position model", () => {
  it("nets available cash as the signed sum of buckets", () => {
    // Operating + MM (positive) less A/P + escrows + reserves (entered negative).
    const e = { values: { operatingCash: 202901.43, ap: -52478.46, insEscrow: -64610, bankTI: 90036.95 } };
    expect(Math.round(netAvailable(e) * 100) / 100).toBe(175849.92);
    expect(netAvailable(undefined)).toBe(0);
    expect(netAvailable({ values: {} })).toBe(0);
  });

  it("has the legacy report's buckets in order", () => {
    expect(CASH_POSITION_BUCKETS.map((b) => b.key)).toEqual([
      "operatingCash", "ap", "retEscrow", "insEscrow",
      "reserveCapital", "reserveOther", "bankTI", "moneyMarket",
    ]);
    // A/P + escrows + reserves are deductions; operating + TI + MM are not.
    expect(CASH_POSITION_BUCKETS.find((b) => b.key === "ap")!.deduction).toBe(true);
    expect(CASH_POSITION_BUCKETS.find((b) => b.key === "moneyMarket")!.deduction).toBe(false);
  });

  it("includes the key entities, grouped", () => {
    const codes = cashPositionCodes();
    expect(codes).toContain("PJV3");
    expect(codes).toContain("NILLC-TSD");
    expect(codes).toContain("LK-TRUST");
    expect(codes).toContain("2300");
    expect(codes).toContain("9510");
    // No duplicate codes.
    expect(new Set(codes).size).toBe(codes.length);
    expect(CASH_POSITION_GROUPS.map((g) => g.id)).toEqual(["bp", "eastwick", "sc", "lik", "gplp", "nock", "kh"]);
  });

  it("week-ending Friday lands on the Friday on or before the date", () => {
    // Wed 2026-06-17 → Friday 6/12.
    expect(weekEndingFriday(new Date(2026, 5, 17))).toBe("2026-06-12");
    // Fri 2026-06-12 → itself.
    expect(weekEndingFriday(new Date(2026, 5, 12))).toBe("2026-06-12");
    // Sat 2026-06-13 → 6/12.
    expect(weekEndingFriday(new Date(2026, 5, 13))).toBe("2026-06-12");
    expect(shiftWeek("2026-06-12", -1)).toBe("2026-06-05");
    expect(shiftWeek("2026-06-12", 2)).toBe("2026-06-26");
  });
});
