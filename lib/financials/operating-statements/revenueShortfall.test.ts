import { describe, it, expect } from "vitest";
import { revenueShortfallReason } from "./flagRules";

const rent = { label: "Rental income", mask: "4230-*" };
const cam = { label: "Common Area", mask: "4910-0000,4910-8501" };
const pctRent = { label: "Percentage Rent", mask: "4240-*" };

describe("revenueShortfallReason — a lease-billed line short of budget", () => {
  it("flags rent short of budget by the floor or more, naming the gap", () => {
    const r = revenueShortfallReason("revenue", rent, 3054, 5054);
    expect(r).toMatch(/\$2,000 under budget/);
    expect(r).toMatch(/billed \$3,054 against \$5,054/);
  });

  it("covers the recoveries billed on a lease every month (CAM)", () => {
    expect(revenueShortfallReason("reimbursement", cam, 29_000, 30_030)).toMatch(/\$1,030 under budget/);
  });

  it("stays quiet under the $500 floor", () => {
    expect(revenueShortfallReason("revenue", rent, 4600, 5054)).toBeNull();
  });

  it("never flags revenue OVER budget", () => {
    expect(revenueShortfallReason("revenue", rent, 9000, 5054)).toBeNull();
  });

  it("ignores lumpy income budgeted evenly (percentage rent)", () => {
    expect(revenueShortfallReason("revenue", pctRent, 0, 2500)).toBeNull();
  });

  it("ignores expense lines and unbudgeted lines", () => {
    expect(revenueShortfallReason("expense", { label: "Electric", mask: "6100-*" }, 0, 4080)).toBeNull();
    expect(revenueShortfallReason("revenue", rent, 0, null)).toBeNull();
  });
});
