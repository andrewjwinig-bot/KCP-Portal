import { describe, it, expect } from "vitest";
import { LK_TRUST, accruedBalance } from "./accrued";

describe("accruedBalance", () => {
  it("is the anchor on the anchor month's first day", () => {
    expect(accruedBalance(LK_TRUST, "2026-08-01")).toBe(1_855_728.52);
  });
  it("compounds daily and takes the monthly charge", () => {
    const sep1 = LK_TRUST.anchor.balance * Math.pow(1 + 0.0315 / 365, 31) - 2;
    expect(accruedBalance(LK_TRUST, "2026-09-01")).toBeCloseTo(sep1, 2);
    expect(accruedBalance(LK_TRUST, "2026-10-19")).toBeGreaterThan(accruedBalance(LK_TRUST, "2026-10-12"));
  });
  it("never projects before the anchor", () => {
    expect(accruedBalance(LK_TRUST, "2026-05-15")).toBe(1_855_728.52);
  });
});
