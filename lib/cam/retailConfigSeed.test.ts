// Validates the retail CAMPRep seed builder: a seeded unit produces a full
// CamConfig with the stipulated shares + CAM admin fee, and an unseeded unit
// returns null (so the storage layer falls through to an empty config).

import { describe, it, expect } from "vitest";
import { seedCamConfig, RETAIL_CONFIG_SEED } from "./retailConfigSeed";

describe("retail CAMPRep config seed", () => {
  it("builds a config from a seeded Parkwood tenant", () => {
    const c = seedCamConfig("1100-34");
    expect(c).not.toBeNull();
    expect(c!.cam.stipulatedPrs).toBe(23.338);
    expect(c!.ins.stipulatedPrs).toBe(23.338);
    expect(c!.ret.stipulatedPrs).toBe(23.338);
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
});
