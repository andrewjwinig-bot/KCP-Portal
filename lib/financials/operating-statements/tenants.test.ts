import { describe, it, expect, vi, beforeEach } from "vitest";

// The directory reads the stored rent roll; stub the store so the test pins the
// resolution rules rather than whatever happens to be uploaded.
const rentroll = {
  properties: [
    {
      propertyCode: "9510",
      units: [
        { unitRef: "9510-406",  occupantName: "Lafayette Cleaners", isVacant: false },
        { unitRef: "9510-500C", occupantName: "Mia Bella Salon",    isVacant: false },
        { unitRef: "9510-412",  occupantName: "",                   isVacant: true  },
      ],
    },
    {
      propertyCode: "2300",
      units: [
        // Skyline zero-pads and suffixes charge accounts; the roll carries the
        // canonical ref.
        { unitRef: "2300-1817", occupantName: "Wawa, Inc.", isVacant: false },
      ],
    },
  ],
};

vi.mock("@/lib/storage", () => ({ getJSON: vi.fn(async () => rentroll) }));

import { buildTenantDirectory, canonicalUnitRef } from "./tenants";

describe("canonicalUnitRef", () => {
  it("strips Skyline's -CU charge suffix", () => {
    expect(canonicalUnitRef("2300-1817-CU")).toBe("2300-1817");
    expect(canonicalUnitRef("9510-406")).toBe("9510-406");
  });
});

describe("findUnit — the unit ref written into a rent charge's text", () => {
  let dir: Awaited<ReturnType<typeof buildTenantDirectory>>;
  beforeEach(async () => { dir = await buildTenantDirectory(); });

  it("reads the suite and its tenant out of a Skyline rent description", () => {
    expect(dir.findUnit("RNT to 9510-406")).toEqual({ unitRef: "9510-406", tenant: "Lafayette Cleaners" });
    // A letter in the unit segment must survive.
    expect(dir.findUnit("RNT to 9510-500C")).toEqual({ unitRef: "9510-500C", tenant: "Mia Bella Salon" });
  });

  it("strips the -CU suffix before matching the roll", () => {
    expect(dir.findUnit("CAM to 2300-1817-CU")).toEqual({ unitRef: "2300-1817", tenant: "Wawa, Inc." });
  });

  it("names a vacant suite without inventing a tenant", () => {
    expect(dir.findUnit("RNT to 9510-412")).toEqual({ unitRef: "9510-412", tenant: null });
  });

  it("falls back to suite-only for a unit that has left the rent roll", () => {
    // 9510 is a known property code, 999 is not a unit on the roll any more.
    expect(dir.findUnit("RNT to 9510-999")).toEqual({ unitRef: "9510-999", tenant: null });
  });

  it("ignores text with no unit ref, and shapes that aren't a property code", () => {
    expect(dir.findUnit("Monthly management fee")).toBeNull();
    expect(dir.findUnit("Invoice 2024-11842")).toBeNull(); // 2024 is not a property
    expect(dir.findUnit("")).toBeNull();
  });

  it("prefers a real rent-roll unit over an earlier shape-only candidate", () => {
    expect(dir.findUnit("1100-99999 reversal, RNT to 9510-406")).toEqual({
      unitRef: "9510-406",
      tenant: "Lafayette Cleaners",
    });
  });
});
