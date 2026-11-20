import { describe, it, expect } from "vitest";
import { restoreHeld } from "./restoreHeld";
import { emptyLedger, finalizeMonth } from "./carryover";

describe("restoreHeld", () => {
  it("adds restored balances beside the current ones, per property and account", () => {
    // Now: September held $40 on 4080 · 8220.
    const now = finalizeMonth(emptyLedger(), "2026-09", [{ propertyId: "4080", accountCode: "8220", accountName: "Supplies", amount: 40 }], "T").ledger;
    // Swept by the deleted December invoice: $70 on the same account, $25 elsewhere.
    const swept = finalizeMonth(emptyLedger(), "2026-08", [
      { propertyId: "4080", accountCode: "8220", accountName: "Supplies", amount: 70 },
      { propertyId: "9510", accountCode: "8300", accountName: "Postage", amount: 25 },
    ], "T").ledger.balances;
    const out = restoreHeld(now, swept, "NOW");
    expect(out.balances["4080"].accounts["8220"].heldTotal).toBe(110);
    expect(out.balances["4080"].accounts["8220"].sinceMonth).toBe("2026-08");
    expect(out.balances["9510"].accounts["8300"].heldTotal).toBe(25);
    expect(out.committedPeriods).toEqual(now.committedPeriods); // nothing reopened
    expect(now.balances["4080"].accounts["8220"].heldTotal).toBe(40); // input untouched
  });
});
