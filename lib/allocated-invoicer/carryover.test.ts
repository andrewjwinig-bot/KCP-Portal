import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  finalizeMonth,
  isAccountBilled,
  isYearEndMonth,
  baseAccountCode,
  priorForAccount,
  priorForProperty,
  CARRYOVER_THRESHOLD,
  type MonthExpense,
} from "./carryover";

const NOW = "2026-07-01T00:00:00.000Z";
const exp = (propertyId: string, accountCode: string, amount: number, accountName = accountCode): MonthExpense =>
  ({ propertyId, accountCode, accountName, amount });

describe("baseAccountCode", () => {
  it("strips the -NNNN suffix", () => {
    expect(baseAccountCode("8220-9301")).toBe("8220");
    expect(baseAccountCode("7000-9303")).toBe("7000");
    expect(baseAccountCode("7000")).toBe("7000");
  });
});

describe("isYearEndMonth", () => {
  it("is true only for December", () => {
    expect(isYearEndMonth("2026-12")).toBe(true);
    expect(isYearEndMonth("2026-11")).toBe(false);
    expect(isYearEndMonth("2026-01")).toBe(false);
  });
});

describe("isAccountBilled", () => {
  it("bills at or above the threshold", () => {
    expect(isAccountBilled(100, "2026-06")).toBe(true);
    expect(isAccountBilled(100.01, "2026-06")).toBe(true);
    expect(isAccountBilled(99.99, "2026-06")).toBe(false);
  });
  it("bills everything at year-end", () => {
    expect(isAccountBilled(1, "2026-12")).toBe(true);
    expect(isAccountBilled(0.5, "2026-12")).toBe(true);
  });
});

describe("finalizeMonth — per-account holding", () => {
  it("holds an under-threshold account and carries it forward", () => {
    const { ledger, decisions } = finalizeMonth(emptyLedger(), "2026-06", [exp("3640", "7000", 42.36, "Legal")], NOW);
    expect(decisions[0].billed).toBe(false);
    expect(priorForAccount(ledger, "3640", "7000")).toBe(42.36);
    expect(ledger.balances["3640"].accounts["7000"].sinceMonth).toBe("2026-06");
    expect(ledger.committedPeriods).toContain("2026-06");
  });

  it("accrues across months and bills once the account crosses $100", () => {
    let led = finalizeMonth(emptyLedger(), "2026-06", [exp("3640", "7000", 42.36)], NOW).ledger;
    led = finalizeMonth(led, "2026-07", [exp("3640", "7000", 40)], NOW).ledger;
    expect(priorForAccount(led, "3640", "7000")).toBe(82.36); // still held
    const r = finalizeMonth(led, "2026-08", [exp("3640", "7000", 30)], NOW);
    const d = r.decisions.find((x) => x.accountCode === "7000")!;
    expect(d.prior).toBe(82.36);
    expect(d.accrued).toBe(112.36);
    expect(d.billed).toBe(true);
    // billed → resets to $0 (account removed from ledger)
    expect(priorForAccount(r.ledger, "3640", "7000")).toBe(0);
    expect(r.ledger.balances["3640"]).toBeUndefined();
  });

  it("bills a single account immediately when it is over $100 on its own", () => {
    const { ledger, decisions } = finalizeMonth(emptyLedger(), "2026-06", [exp("3640", "8220", 150)], NOW);
    expect(decisions[0].billed).toBe(true);
    expect(ledger.balances["3640"]).toBeUndefined();
  });

  it("holds some accounts while billing others in the same property", () => {
    const { ledger, decisions } = finalizeMonth(emptyLedger(), "2026-06", [
      exp("3640", "8220", 150, "Big"),
      exp("3640", "7000", 20, "Small"),
    ], NOW);
    const big = decisions.find((d) => d.accountCode === "8220")!;
    const small = decisions.find((d) => d.accountCode === "7000")!;
    expect(big.billed).toBe(true);
    expect(small.billed).toBe(false);
    // only the small one carries forward
    expect(Object.keys(ledger.balances["3640"].accounts)).toEqual(["7000"]);
    expect(priorForProperty(ledger, "3640")).toBe(20);
  });

  it("carries prior-held accounts forward unchanged when they have no activity this month", () => {
    let led = finalizeMonth(emptyLedger(), "2026-06", [exp("3640", "7000", 42.36)], NOW).ledger;
    // next month: a different account bills, 7000 has no activity
    led = finalizeMonth(led, "2026-07", [exp("3640", "8220", 200)], NOW).ledger;
    expect(priorForAccount(led, "3640", "7000")).toBe(42.36); // still held
  });
});

describe("finalizeMonth — year-end flush", () => {
  it("bills all held accounts in December, even with no activity", () => {
    let led = finalizeMonth(emptyLedger(), "2026-06", [
      exp("3640", "7000", 42.36),
      exp("40A0", "9100", 15),
    ], NOW).ledger;
    expect(priorForProperty(led, "3640")).toBe(42.36);
    expect(priorForProperty(led, "40A0")).toBe(15);

    const r = finalizeMonth(led, "2026-12", [exp("3640", "7000", 10)], NOW);
    // 3640/7000 accrues 52.36 but year-end forces bill; 40A0/9100 (no activity) flushed too
    const a = r.decisions.find((d) => d.propertyId === "3640" && d.accountCode === "7000")!;
    expect(a.accrued).toBe(52.36);
    expect(a.billed).toBe(true);
    const b = r.decisions.find((d) => d.propertyId === "40A0" && d.accountCode === "9100")!;
    expect(b.thisMonth).toBe(0);
    expect(b.accrued).toBe(15);
    expect(b.billed).toBe(true);
    // ledger fully cleared
    expect(Object.keys(r.ledger.balances)).toHaveLength(0);
  });
});

describe("finalizeMonth — purity & idempotency guard", () => {
  it("does not mutate the input ledger", () => {
    const base = finalizeMonth(emptyLedger(), "2026-06", [exp("3640", "7000", 42.36)], NOW).ledger;
    const snapshot = JSON.stringify(base);
    finalizeMonth(base, "2026-07", [exp("3640", "7000", 40)], NOW);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("records the committed period exactly once", () => {
    const r = finalizeMonth(emptyLedger(), "2026-06", [exp("3640", "7000", 42)], NOW);
    const r2 = finalizeMonth(r.ledger, "2026-06", [], NOW);
    expect(r2.ledger.committedPeriods.filter((p) => p === "2026-06")).toHaveLength(1);
  });
});

describe("threshold constant", () => {
  it("is $100", () => {
    expect(CARRYOVER_THRESHOLD).toBe(100);
  });
});
