import { describe, it, expect } from "vitest";
import { splitIntoMonths, computeMonths } from "./autoProcess";
import { emptyLedger, type CarryoverLedger } from "./carryover";
import type { GLParseResult, GLTransaction } from "./glParser";
import { ALLOC_PCT } from "@/lib/properties/data";

// A single 9303 G&A account, $400 net in each of Jan + Feb 2026. Property 4500's
// 9303 share is 0.2244 → $89.76/month, under the $100 hold threshold, so it holds
// in January and bills in February once the accrued balance crosses $100.
const SHARE_4500 = ALLOC_PCT["4500"]["9303"]; // 0.2244
const MONTHLY_4500 = Math.round(400 * SHARE_4500 * 100) / 100; // 89.76

function tx(date: string, net: number): GLTransaction {
  return { accountCode: "8220-9303", accountSuffix: "9303", accountName: "G&A Overhead", date, description: "x", jrn: "", ref: "", debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, net };
}

function rangeGl(): GLParseResult {
  const transactions = [tx("1/15/2026", 400), tx("2/15/2026", 400)];
  return {
    periodText: "1/1/2026 To 2/28/2026",
    periodEndDate: "2026-02-28",
    statementMonth: "2026-01_to_2026-02",
    transactions,
    accountTotals: new Map(), // ignored for a range — rebuilt per month from txs
  };
}

const amt = (bp: { code: string; amount: number }[], code: string) => bp.find((b) => b.code === code)?.amount;

describe("multi-month range allocation", () => {
  it("splits a range GL into its calendar months in order", () => {
    const parts = splitIntoMonths(rangeGl());
    expect(parts.map((p) => p.statementMonth)).toEqual(["2026-01", "2026-02"]);
    // Each month rebuilds its own account totals from that month's transactions.
    expect(parts[0].accountTotals.get("8220-9303")?.netTotal).toBe(400);
    expect(parts[1].accountTotals.get("8220-9303")?.netTotal).toBe(400);
  });

  it("chains carryover across months: 4500 holds in Jan, bills the accrued sum in Feb", () => {
    const res = computeMonths(rangeGl(), emptyLedger());
    if ("error" in res) throw new Error(res.error);
    expect(res.months.map((m) => m.statementMonth)).toEqual(["2026-01", "2026-02"]);
    expect(res.skipped).toEqual([]);

    // January: 4500 is under $100 → held, not billed.
    expect(amt(res.months[0].byProperty, "4500")).toBeUndefined();
    // February: accrued 89.76 + 89.76 = 179.52 → bills.
    expect(amt(res.months[1].byProperty, "4500")).toBeCloseTo(MONTHLY_4500 * 2, 2);
    // Combined summary reflects only what actually bills across the range.
    expect(amt(res.byProperty, "4500")).toBeCloseTo(MONTHLY_4500 * 2, 2);
  });

  it("is idempotent: an already-committed month is skipped, later months still bill correctly", () => {
    // Ledger where January was already finalized (4500 holding its Jan share).
    const ledger: CarryoverLedger = {
      committedPeriods: ["2026-01"],
      updatedAt: "",
      balances: {
        "4500": {
          propertyId: "4500",
          updatedAt: "",
          accounts: {
            "8220": { accountCode: "8220", accountName: "G&A Overhead", heldTotal: MONTHLY_4500, months: [{ statementMonth: "2026-01", amount: MONTHLY_4500 }], sinceMonth: "2026-01", updatedAt: "" },
          },
        },
      },
    };
    const res = computeMonths(rangeGl(), ledger);
    if ("error" in res) throw new Error(res.error);
    // January is not reprocessed; only February remains.
    expect(res.skipped).toEqual(["2026-01"]);
    expect(res.months.map((m) => m.statementMonth)).toEqual(["2026-02"]);
    // February still bills the full accrued balance (Jan hold + Feb) — 179.52.
    expect(amt(res.months[0].byProperty, "4500")).toBeCloseTo(MONTHLY_4500 * 2, 2);
  });
});
