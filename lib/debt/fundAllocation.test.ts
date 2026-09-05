import { describe, it, expect } from "vitest";
import {
  allocateLoanByBuilding,
  allocationBasisForLoan,
  fundCodeForLoan,
  isFundLoan,
} from "./fundAllocation";
import {
  JV_III_3600_LOAN,
  NI_LLC_4000_LOAN,
  BROOKWOOD_2300_LOAN,
} from "./amortization";

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

describe("fund loan → per-building allocation", () => {
  it("identifies the two Business Park fund loans", () => {
    expect(isFundLoan(JV_III_3600_LOAN)).toBe(true);
    expect(isFundLoan(NI_LLC_4000_LOAN)).toBe(true);
    expect(fundCodeForLoan(JV_III_3600_LOAN)).toBe("PJV3");
    expect(fundCodeForLoan(NI_LLC_4000_LOAN)).toBe("PNIPLX");
  });

  it("treats single-property shopping-center loans as non-fund", () => {
    expect(isFundLoan(BROOKWOOD_2300_LOAN)).toBe(false);
    expect(
      allocateLoanByBuilding(BROOKWOOD_2300_LOAN, { payment: 100, principal: 50, interest: 50, balance: 1000 }),
    ).toBeNull();
  });

  it("JV III uses the booked GL percentage interests (30/35/35)", () => {
    expect(allocationBasisForLoan(JV_III_3600_LOAN)).toBe("GL");
    // ~$23,023 interest-only monthly service → $6,907 / $8,058 / $8,058 per the GL.
    const rows = allocateLoanByBuilding(JV_III_3600_LOAN, {
      payment: 23022.35,
      principal: 0,
      interest: 23022.35,
      balance: 6139294.1,
    })!;
    expect(rows.map((r) => r.id)).toEqual(["3610", "3620", "3640"]); // building-code order
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by["3610"].share).toBe(0.3);
    expect(by["3620"].share).toBe(0.35);
    expect(by["3640"].share).toBe(0.35);
    expect(by["3610"].payment).toBeCloseTo(6906.71, 2);
    expect(by["3620"].payment).toBeCloseTo(8057.82, 2);
    expect(by["3640"].payment).toBeCloseTo(8057.82, 2);
    expect(sum(rows.map((r) => r.payment))).toBeCloseTo(23022.35, 2);
    expect(sum(rows.map((r) => r.balance))).toBeCloseTo(6139294.1, 2);
    expect(sum(rows.map((r) => r.share))).toBeCloseTo(1, 6);
  });

  it("NI LLC splits across its 7 buildings on the SF fallback until its GL split is confirmed", () => {
    expect(allocationBasisForLoan(NI_LLC_4000_LOAN)).toBe("SF");
    const amounts = { payment: 153376.33, principal: 20050, interest: 93058.25, balance: 22789590.83 };
    const rows = allocateLoanByBuilding(NI_LLC_4000_LOAN, amounts)!;
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.id)).toEqual(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
    expect(sum(rows.map((r) => r.payment))).toBeCloseTo(amounts.payment, 2);
    expect(sum(rows.map((r) => r.balance))).toBeCloseTo(amounts.balance, 2);
    // Building 8 (127,848 SF) is largest, so it takes the largest slice.
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by["4080"].payment).toBe(Math.max(...rows.map((r) => r.payment)));
  });
});
