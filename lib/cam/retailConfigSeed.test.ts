// Validates the retail CAMPRep seed builder: a seeded unit produces a full
// CamConfig with the stipulated shares + CAM admin fee, and an unseeded unit
// returns null (so the storage layer falls through to an empty config).

import { describe, it, expect } from "vitest";
import { seedCamConfig, RETAIL_CONFIG_SEED } from "./retailConfigSeed";

describe("retail CAMPRep config seed", () => {
  it("builds a config from a seeded Parkwood tenant", () => {
    const c = seedCamConfig("1100-34");
    expect(c).not.toBeNull();
    expect(c!.cam.stipulatedPrs).toBe(23.3378);
    expect(c!.ins.stipulatedPrs).toBe(23.3378);
    expect(c!.ret.stipulatedPrs).toBe(23.3378);
    expect(c!.cam.adminFeePct).toBe(10);
    expect(c!.grossLease).toBe(false);
  });

  it("returns null for an unseeded unit (falls through to empty/saved)", () => {
    expect(seedCamConfig("9999-99")).toBeNull();
  });

  it("only seeds reconciling tenants (vacant suites omitted)", () => {
    expect(RETAIL_CONFIG_SEED["1100-30"]).toBeUndefined();
    expect(RETAIL_CONFIG_SEED["1100-32"]).toBeUndefined();
  });

  it("seeds Planet Fitness's CAM cap (2300-1851)", () => {
    const c = seedCamConfig("2300-1851");
    expect(c!.cam.adminFeePct).toBe(7);
    expect(c!.camCap?.priorYear).toBe(2024);
    expect(c!.camCap?.controllableAmount).toBe(105457);
    expect(c!.camCap?.growthPct).toBe(4);
  });

  it("seeds M&T's expense exclusion + T-Mobile's admin-fee exclusion", () => {
    const mt = seedCamConfig("2300-1817");
    expect(mt!.hasExpenseExclusions).toBe(true);
    expect(mt!.camExcludedLines).toContain("Building Maintenance");
    const tmo = seedCamConfig("2300-1867");
    expect(tmo!.hasAdminFeeExclusions).toBe(true);
    expect(tmo!.camAdminExcludedLines).toContain("Liability Insurance");
    const dunkin = seedCamConfig("2300-1885");
    expect(dunkin!.hasExpenseExclusions).toBe(true);
    expect(dunkin!.camExcludedLines).toEqual(["Building Maintenance", "Security"]);
  });

  it("does NOT seed PRS for 2300 (propertyRules prefills the denominators)", () => {
    const c = seedCamConfig("2300-1847");
    expect(c!.cam.stipulatedPrs).toBeNull();
    expect(c!.ins.stipulatedPrs).toBeNull();
    expect(c!.ret.stipulatedPrs).toBeNull();
  });
});
