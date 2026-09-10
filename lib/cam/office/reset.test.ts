import { describe, it, expect } from "vitest";
import { assembleTenantInputs, type RosterUnit, type OfficeLeaseConfig, type ResetInfo } from "./assemble";

const cfg: Record<string, OfficeLeaseConfig> = {
  "4070-301": { baseYear: 2022, grossUp: true, proRataPct: 10.91, opexEscrow: 8000, retEscrow: 1200 },
};
const roster: RosterUnit[] = [
  { unitRef: "4070-301", occupantName: "Veltri, Inc.", sqft: 6374, isVacant: false, leaseFrom: "1/1/2000", leaseTo: "12/31/2030", opexMonth: 0, reTaxMonth: 0 },
];

describe("base-year reset proration", () => {
  it("keeps occupancy at 100% but prorates recovery through the day before the reset", () => {
    const resets: Record<string, ResetInfo> = {
      "4070-301": { resetDate: "2025-07-01", originalBaseYear: 2022, newBaseYear: 2025 },
    };
    const t = assembleTenantInputs(roster, 2025, cfg, resets)[0];
    // Continuing tenant → 100% occupancy; recovery only Jan 1 – Jun 30 = 181/365.
    expect(t.occPct).toBe(1);
    expect(Math.round(t.recoveryPct * 1e6) / 1e6).toBe(Math.round((181 / 365) * 1e6) / 1e6);
    expect(t.baseYearResetISO).toBe("2025-07-01");
  });

  it("ignores a reset from a different year (full year, no footnote)", () => {
    const resets: Record<string, ResetInfo> = {
      "4070-301": { resetDate: "2024-06-30", originalBaseYear: 2020, newBaseYear: 2024 },
    };
    const t = assembleTenantInputs(roster, 2025, cfg, resets)[0];
    expect(t.occPct).toBe(1);
    expect(t.recoveryPct).toBe(1);
    expect(t.baseYearResetISO).toBeNull();
  });

  it("no resets → full year, no footnote (unchanged)", () => {
    const t = assembleTenantInputs(roster, 2025, cfg)[0];
    expect(t.occPct).toBe(1);
    expect(t.recoveryPct).toBe(1);
    expect(t.baseYearResetISO).toBeNull();
  });
});
