import { describe, it, expect } from "vitest";
import { unsentBatches } from "./unsent";

const now = new Date("2026-10-02T12:00:00Z");
describe("generated but never sent to AvidXchange", () => {
  it("an Allocated run downloaded Sep 24 with no allocated send is NOT SENT", () => {
    const r = unsentBatches([{ source: "allocated", label: "Allocated Expenses", period: "August 2026", at: "2026-09-24T15:00:00Z", by: "DREW" }],
      [{ source: "payroll", sentAt: "2026-09-23T15:54:00Z" }], now);
    expect(r.map((x) => x.source)).toEqual(["allocated"]);
  });
  it("a send after (or just before) the batch clears it; only the NEWEST batch is judged", () => {
    expect(unsentBatches([{ source: "payroll", label: "Payroll", period: "09/25", at: "2026-09-23T16:00:00Z" }],
      [{ source: "payroll", sentAt: "2026-09-23T15:54:00Z" }], now)).toEqual([]);
    expect(unsentBatches([
      { source: "credit-card", label: "CC", period: "Aug", at: "2026-09-21T00:00:00Z" },
      { source: "credit-card", label: "CC", period: "Sep", at: "2026-09-30T00:00:00Z" },
    ], [{ source: "credit-card", sentAt: "2026-09-22T00:00:00Z" }], now).map((x) => x.period)).toEqual(["Sep"]);
  });
  it("ignores batches before the send log existed, and old history", () => {
    expect(unsentBatches([{ source: "allocated", label: "A", period: "Jul", at: "2026-08-20T00:00:00Z" }], [], now)).toEqual([]);
  });
});
