import { describe, expect, it } from "vitest";
import { reprojectedBank } from "./bankRoll";

const zeros = () => new Array(12).fill(0);

describe("reprojectedBank", () => {
  const line = { balance: 100_000, asOf: "2026-11-15", accounts: [{ bank: "chase", last4: "1234", name: "Op", balance: 100_000 }] };

  it("rolls today's balance to Dec 31 on the rest of the year's cash flow", () => {
    const cf = zeros(); cf[10] = 3_000; cf[11] = 5_000; // Nov 30 days, as of the 15th → half of Nov
    const r = reprojectedBank({ line, year: 2026, cashFlow: cf, plan: zeros(), paidOnGl: zeros() })!;
    expect(r.cashFlowRest).toBe(6_500);
    expect(r.yearEnd).toBe(106_500);
    expect(r.distributionsRest).toBe(0);
  });

  it("takes off the distributions still planned", () => {
    const cf = zeros(); cf[11] = 10_000;
    const plan = zeros(); plan[11] = 40_000;
    const r = reprojectedBank({ line, year: 2026, cashFlow: cf, plan, paidOnGl: zeros() })!;
    expect(r.distributionsRest).toBe(40_000);
    expect(r.yearEnd).toBe(70_000);
  });

  it("says nothing for a balance from another year, or no balance", () => {
    expect(reprojectedBank({ line, year: 2025, cashFlow: zeros(), plan: zeros(), paidOnGl: zeros() })).toBeNull();
    expect(reprojectedBank({ line: null, year: 2026, cashFlow: zeros(), plan: zeros(), paidOnGl: zeros() })).toBeNull();
  });
});
