import { describe, it, expect } from "vitest";
import { plannedDistributions, cashOnGl, distributionsOnGl, projectBalance, rollForward, isOperatingCash } from "./cashForecast";

describe("planned distributions", () => {
  it("splits the annual plan between April and October", () => {
    const m = plannedDistributions("4500");
    expect(m[3]).toBe(250_000);
    expect(m[9]).toBe(250_000);
    expect(m.reduce((a, b) => a + b, 0)).toBe(500_000);
    expect(plannedDistributions("7300")[3]).toBe(150_000);
    expect(plannedDistributions("7010").reduce((a, b) => a + b, 0)).toBe(200_000);
    expect(plannedDistributions("8200").reduce((a, b) => a + b, 0)).toBe(200_000);
  });
  it("is zero for a property with no plan", () => {
    expect(plannedDistributions("9510").every((v) => v === 0)).toBe(true);
  });
});

describe("cash on the GL", () => {
  const gl = {
    beginning: { "0110-0000": 100_000, "0250-0000": 20_000, "2720-0000": -900_000 },
    monthly: { "0110-0000": [5_000, -2_000, 3_000, 0, 0, 0, 0, 0, 0, 0, 0, 0], "0250-0000": [1_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "3050-0000": [0, 0, 0, 50_000, 0, 0, 0, 0, 0, 0, 0, 0] },
    names: { "0110-0000": "Cash - Operating", "0250-0000": "Security Deposits", "2720-0000": "Mortgage", "3050-0000": "Partner Distributions" },
    maxPeriodInFile: 2,
  };
  it("sums operating cash through the last posted month, deposits excluded", () => {
    const c = cashOnGl(gl)!;
    expect(c.month).toBe(2);
    expect(c.balance).toBe(103_000);
    expect(c.accounts.map((a) => a.code)).toEqual(["0110-0000"]);
    expect(isOperatingCash("0250-0000", "Security Deposits")).toBe(false);
  });
  it("is null without opening balances — nets alone are not a balance", () => {
    expect(cashOnGl({ monthly: gl.monthly, names: gl.names, maxPeriodInFile: 2 })).toBeNull();
  });
  it("reads distributions off the capital accounts", () => {
    expect(distributionsOnGl(gl)[3]).toBe(50_000);
  });
});

describe("projected balance", () => {
  it("rolls the opening forward: + cash flow − distributions", () => {
    const cf = new Array(12).fill(10_000);
    const d = plannedDistributions("7010");
    const b = projectBalance(50_000, cf, d);
    expect(b[0]).toBe(60_000);
    expect(b[3]).toBe(50_000 + 40_000 - 100_000);
    expect(b[11]).toBe(50_000 + 120_000 - 200_000);
  });
  it("rolls this year forward from the GL's last month", () => {
    const cf = new Array(12).fill(1_000);
    expect(rollForward(10_000, 8, cf, plannedDistributions("7010"))).toBe(10_000 + 4_000 - 100_000);
  });
});
