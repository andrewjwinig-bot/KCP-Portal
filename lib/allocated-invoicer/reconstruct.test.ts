import { describe, it, expect } from "vitest";
import { computeMonths, replayThrough } from "./autoProcess";
import { emptyLedger, finalizeMonth } from "./carryover";
import type { GLParseResult } from "./glParser";

function gl(month: string, entries: { code: string; suffix: "9301" | "9302" | "9303"; net: number }[]): GLParseResult {
  const accountTotals = new Map();
  for (const e of entries) {
    const full = `${e.code}-${e.suffix}`;
    accountTotals.set(full, { accountCode: full, accountName: `Acct ${e.code}`, accountSuffix: e.suffix, netTotal: e.net });
  }
  return { statementMonth: month, periodText: month, periodEndDate: `${month}-28`, transactions: [], accountTotals };
}

describe("replayThrough — rebuilding a sent month from the GL", () => {
  const jan = gl("2026-01", [{ code: "8220", suffix: "9301", net: 300 }]);   // small → held at most buildings
  const feb = gl("2026-02", [{ code: "8220", suffix: "9301", net: 300 }]);   // carries Jan's held balance forward
  const mar = gl("2026-03", [{ code: "8220", suffix: "9301", net: 10000 }]);

  it("matches what month-by-month sends billed, carry-forward included", () => {
    // What actually happened: Jan sent, then Feb sent, each finalizing.
    let led = emptyLedger();
    const sent: Record<string, { code: string; amount: number }[]> = {};
    for (const g of [jan, feb, mar]) {
      const res = computeMonths(g, led);
      if ("error" in res) throw new Error(res.error);
      const m = res.months[0];
      sent[g.statementMonth] = m.byProperty;
      led = finalizeMonth(led, m.statementMonth, m.expenses, "NOW").ledger;
    }
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      const r = replayThrough([mar, jan, feb], month);
      if ("error" in r) throw new Error(r.error);
      expect(r.byProperty).toEqual(sent[month]);
    }
  });

  it("says so when the GL has no activity for the month", () => {
    expect("error" in replayThrough([jan], "2026-04")).toBe(true);
  });
});
