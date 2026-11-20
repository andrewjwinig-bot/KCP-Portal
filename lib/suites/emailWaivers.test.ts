import { describe, it, expect } from "vitest";
import { waiverFor, type EmailWaiverDoc } from "./emailWaivers";

const empty: EmailWaiverDoc = { waivers: [], cleared: [] };

describe("tenant email waivers", () => {
  it("sets aside the seeded non-tenants and the tenant in default", () => {
    expect(waiverFor(empty, "9999-1", "Tesla, Inc.")).toBe("Not a tenant");
    expect(waiverFor(empty, "7010-12311", "Rite Aid of Pennsylvania")).toBe("In default");
    expect(waiverFor(empty, "9999-3", "Gym Fees")).toBe("Not a suite");
    expect(waiverFor(empty, "9999-GYM", "Fitness Center")).toBe("Not a suite");
    expect(waiverFor(empty, "9999-4", "Outfront Media LLC")).toBe("Not a suite");
    expect(waiverFor(empty, "9999-5", "OUT FRONT MEDIA")).toBe("Not a suite");
    expect(waiverFor(empty, "9999-6", "Acme Widgets")).toBeNull();
  });
  it("a saved waiver holds only while the same tenant is in the suite", () => {
    const doc: EmailWaiverDoc = { waivers: [{ unitRef: "9999-7", tenant: "Old Co.", reason: "In default", by: null, at: "" }], cleared: [] };
    expect(waiverFor(doc, "9999-7", "OLD CO")).toBe("In default");
    expect(waiverFor(doc, "9999-7", "New Tenant LLC")).toBeNull();
  });
  it("an undone seed stays undone", () => {
    expect(waiverFor({ waivers: [], cleared: ["9999-1"] }, "9999-1", "Tesla")).toBeNull();
  });
});
