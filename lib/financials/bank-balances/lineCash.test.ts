import { describe, it, expect } from "vitest";
import { cashByLine, fundLineOf } from "./lineCash";
import { BALANCE_ACCOUNTS, accountId, entityFor } from "./entities";

const stored = (last4: string, balance: number, asOf: string) => {
  const a = BALANCE_ACCOUNTS.find((x) => x.last4 === last4)!;
  return [accountId(a.bank, a.last4), { bank: a.bank, last4, name: a.accountName, balance, asOf }] as const;
};

describe("bank cash by Cash Analysis line", () => {
  it("sums a line's accounts and dates it by the oldest", () => {
    const lik = BALANCE_ACCOUNTS.filter((a) => entityFor(a).key === "2010" && !entityFor(a).restricted).map((a) => a.last4);
    const m = cashByLine(Object.fromEntries(lik.map((l, i) => stored(l, 100 * (i + 1), i ? "2026-10-13" : "2026-10-12"))));
    const line = m.get("2010")!;
    expect(line.accounts).toHaveLength(lik.length);
    expect(line.asOf).toBe("2026-10-12");
  });
  it("never counts tenants' security deposits", () => {
    const m = cashByLine(Object.fromEntries([stored("x7216", 5_000, "2026-10-13"), stored("x8276", 7_000, "2026-10-13")]));
    expect([...m.values()].some((l) => l.balance)).toBe(false);
  });
  it("finds the fund a building banks through", () => {
    expect(fundLineOf("3610")).toBe("PJV3");
    expect(fundLineOf("4500")).toBeNull();
  });
});
