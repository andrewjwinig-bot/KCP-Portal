import { describe, it, expect } from "vitest";
import { billedOf } from "./billedLabel";

describe("billedOf — a full-year GL reads as the month it bills", () => {
  it("Jan–Jul GL with Jan–Jun already finalized bills July", () => {
    expect(billedOf({ months: [{ statementMonth: "2026-07" }], catchup: null }))
      .toEqual({ billedLabel: "July 2026", billedMonths: ["2026-07"] });
  });
  it("names late charges to finalized months", () => {
    expect(billedOf({ months: [{ statementMonth: "2026-08" }], catchup: { sourceMonths: ["2026-06", "2026-03"] } }).billedLabel)
      .toBe("August 2026 + late charges (Mar, Jun)");
  });
  it("late charges only", () => {
    expect(billedOf({ months: [], catchup: { sourceMonths: ["2026-06"] } }).billedLabel).toBe("Late charges (Jun 2026)");
  });
  it("a skipped month bills both", () => {
    expect(billedOf({ months: [{ statementMonth: "2026-06" }, { statementMonth: "2026-07" }], catchup: null }).billedLabel).toBe("Jun – July 2026");
  });
});
