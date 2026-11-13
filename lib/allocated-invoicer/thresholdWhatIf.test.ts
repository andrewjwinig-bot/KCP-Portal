import { describe, expect, it } from "vitest";
import { thresholdWhatIf } from "./autoProcess";

// Synthetic months: one 9303 account of $10,000 a month. 5600 (0.36%) accrues
// $36/mo — billed when its account crosses the hold.
function month(m: string, amt: number): any {
  const totals = new Map([["8220-9303", { accountCode: "8220-9303", accountName: "Office", accountSuffix: "9303", netTotal: amt }]]);
  return { statementMonth: m, periodText: m, accountTotals: totals, transactions: [], periodEndDate: `${m}-28` };
}

describe("hold threshold what-if", () => {
  it("a higher hold sends fewer invoices for the same spend", () => {
    const parts = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((m) => month(m, 10000));
    const r = thresholdWhatIf(parts, [100, 250]);
    if ("error" in r) throw new Error(r.error);
    expect(r.totals.invoices[0]).toBeGreaterThan(0);
    expect(r.totals.invoices[1]).toBeLessThan(r.totals.invoices[0]);
    // the same dollars over the year, less what is still held
    expect(r.totals.billed[0] + r.totals.heldAtEnd[0]).toBeCloseTo(r.totals.billed[1] + r.totals.heldAtEnd[1], 0);
  });
});
