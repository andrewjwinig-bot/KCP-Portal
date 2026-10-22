import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ getJSON: vi.fn(), storeJSON: vi.fn() }));
import { withoutYear2025 } from "./recoverHeld";
import { emptyLedger, finalizeMonth } from "./carryover";
import { computeOneMonth } from "./autoProcess";

describe("withoutYear2025", () => {
  it("drops held entries from 2025 months and re-sums what is left", () => {
    let led = emptyLedger();
    for (const [m, amt] of [["2025-10", 30], ["2026-02", 40], ["2026-05", 20]] as const) {
      led = finalizeMonth(led, m, [{ propertyId: "7200", accountCode: "8950", accountName: "Postage", amount: amt }], "T").ledger;
    }
    const { kept, dropped } = withoutYear2025(led.balances);
    const a = kept["7200"].accounts["8950"];
    expect(a.heldTotal).toBe(60);
    expect(a.sinceMonth).toBe("2026-02");
    expect(a.months.map((m) => m.statementMonth)).toEqual(["2026-02", "2026-05"]);
    expect(dropped).toBe(30);
  });
});

describe("billAllOnNextSend", () => {
  it("bills every held balance on the next month, as December does, then clears", () => {
    let led = finalizeMonth(emptyLedger(), "2026-08", [{ propertyId: "4080", accountCode: "8220", accountName: "Supplies", amount: 40 }], "T").ledger;
    led = { ...led, billAllOnNextSend: true };
    const accountTotals = new Map([["8300-9301", { accountCode: "8300-9301", accountName: "Postage", accountSuffix: "9301", netTotal: 10 }]]);
    const c = computeOneMonth({ statementMonth: "2026-10", periodText: "", periodEndDate: "2026-10-31", transactions: [], accountTotals } as any, led);
    if ("error" in c) throw new Error(c.error);
    expect(c.byProperty.find((b) => b.code === "4080")?.amount).toBeGreaterThanOrEqual(40);
    const after = finalizeMonth(led, "2026-10", c.expenses, "T").ledger;
    expect(after.balances["4080"]).toBeUndefined();
    expect(after.billAllOnNextSend).toBeUndefined();
  });
});
