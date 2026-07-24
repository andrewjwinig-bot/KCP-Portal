import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  finalizeMonth,
  isBilled,
  isYearEndMonth,
  priorBalance,
  CARRYOVER_THRESHOLD,
  type HeldTx,
} from "./carryover";

function tx(propertyId: string, amount: number, statementMonth: string): HeldTx {
  return {
    date: `${statementMonth}-15`,
    cardMember: "Test",
    description: "charge",
    codedDescription: "",
    category: "G&A",
    propertyId,
    suite: "",
    amount,
    statementMonth,
  };
}

describe("carryover threshold", () => {
  it("holds a property whose accrued balance is under $100", () => {
    const { ledger, decisions } = finalizeMonth(
      emptyLedger(),
      "2026-01",
      [{ propertyId: "4500", tx: [tx("4500", 12, "2026-01")] }],
      "now",
    );
    expect(decisions[0].billed).toBe(false);
    expect(priorBalance(ledger, "4500")).toBe(12);
    expect(ledger.balances["4500"].heldTx).toHaveLength(1);
    expect(ledger.committedPeriods).toContain("2026-01");
  });

  it("accrues across months and bills once the balance crosses the threshold", () => {
    let ledger = emptyLedger();
    ({ ledger } = finalizeMonth(ledger, "2026-01", [{ propertyId: "4500", tx: [tx("4500", 12, "2026-01")] }], "now"));
    ({ ledger } = finalizeMonth(ledger, "2026-02", [{ propertyId: "4500", tx: [tx("4500", 30, "2026-02")] }], "now"));
    expect(priorBalance(ledger, "4500")).toBe(42);

    const res = finalizeMonth(ledger, "2026-03", [{ propertyId: "4500", tx: [tx("4500", 65, "2026-03")] }], "now");
    const d = res.decisions.find((x) => x.propertyId === "4500")!;
    expect(d.prior).toBe(42);
    expect(d.accrued).toBe(107);
    expect(d.billed).toBe(true);
    // billed → balance resets to $0
    expect(priorBalance(res.ledger, "4500")).toBe(0);
    expect(res.ledger.balances["4500"]).toBeUndefined();
  });

  it("bills immediately when a single month is already over the threshold", () => {
    const { decisions } = finalizeMonth(
      emptyLedger(),
      "2026-04",
      [{ propertyId: "7010", tx: [tx("7010", 250, "2026-04")] }],
      "now",
    );
    expect(decisions[0].billed).toBe(true);
  });

  it("never holds exempt property 2010", () => {
    const { ledger, decisions } = finalizeMonth(
      emptyLedger(),
      "2026-05",
      [{ propertyId: "2010", tx: [tx("2010", 5, "2026-05")] }],
      "now",
    );
    expect(decisions[0].billed).toBe(true);
    expect(ledger.balances["2010"]).toBeUndefined();
  });
});

describe("year-end flush (December)", () => {
  it("flushes a sub-threshold balance that had charges in December", () => {
    let ledger = emptyLedger();
    ({ ledger } = finalizeMonth(ledger, "2026-11", [{ propertyId: "4500", tx: [tx("4500", 20, "2026-11")] }], "now"));
    expect(priorBalance(ledger, "4500")).toBe(20);

    const res = finalizeMonth(ledger, "2026-12", [{ propertyId: "4500", tx: [tx("4500", 10, "2026-12")] }], "now");
    const d = res.decisions.find((x) => x.propertyId === "4500")!;
    expect(d.accrued).toBe(30);
    expect(d.billed).toBe(true); // under $100 but December → billed
    expect(res.ledger.balances["4500"]).toBeUndefined();
  });

  it("flushes a held balance even with NO new charges in December", () => {
    let ledger = emptyLedger();
    ({ ledger } = finalizeMonth(ledger, "2026-11", [{ propertyId: "8200", tx: [tx("8200", 15, "2026-11")] }], "now"));

    // December run only codes a different property; 8200 has no new charges.
    const res = finalizeMonth(ledger, "2026-12", [{ propertyId: "7010", tx: [tx("7010", 5, "2026-12")] }], "now");
    const flushed = res.decisions.find((x) => x.propertyId === "8200")!;
    expect(flushed.billed).toBe(true);
    expect(flushed.accrued).toBe(15);
    // every balance flushed at year-end
    expect(Object.keys(res.ledger.balances)).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("detects December statement months", () => {
    expect(isYearEndMonth("2026-12")).toBe(true);
    expect(isYearEndMonth("2026-01")).toBe(false);
  });

  it("isBilled honors threshold, exemption, and year-end", () => {
    expect(isBilled("4500", CARRYOVER_THRESHOLD, "2026-06")).toBe(true);
    expect(isBilled("4500", 99.99, "2026-06")).toBe(false);
    expect(isBilled("4500", 1, "2026-12")).toBe(true);
    expect(isBilled("2010", 1, "2026-06")).toBe(true);
  });
});
