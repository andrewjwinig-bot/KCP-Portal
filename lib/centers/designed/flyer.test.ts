import { describe, it, expect } from "vitest";
import { FLYERS, leadingTenants, propertyFor, withAvailDesc } from "./flyer";
import { syncSuites, type DesignedSuite } from "./sync";
import { centerBySlug } from "../registry";
import { PARKWOOD_COMMONS_SUITES } from "./parkwoodCommons";

const suite = (o: Partial<DesignedSuite>): DesignedSuite => ({ id: "1", x: 0, y: 0, w: 1, h: 1, tenant: "", use: "", sf: 0, status: "leased", ...o });

describe("leasing flyer data comes from the portal", () => {
  it("names the leading tenants off the synced roll, never a Coming soon or a shadow", () => {
    const s = [
      suite({ id: "a", tenant: "Small", sf: 900 }), suite({ id: "b", tenant: "Big &amp; Co", sf: 9000 }),
      suite({ id: "c", tenant: "Coming soon", sf: 50000 }), suite({ id: "d", tenant: "Next Door", sf: 40000, shadow: true }),
      suite({ id: "e", tenant: "", sf: 3000, status: "available" }),
    ];
    expect(leadingTenants(s)).toEqual(["Big & Co", "Small"]);
  });
  it("takes GLA live and the contact and address from the registry", () => {
    const p = centerBySlug("parkwood-professional")!;
    const prop = propertyFor(p, FLYERS["parkwood-professional"], [], 8287, "/centers/parkwood-commons/assets");
    expect(prop).toMatchObject({ name: "Parkwood Commons", gla: "8,287 SF", contact: { email: p.contact.email }, address: p.addressLine });
    expect(prop.stats[0]).toEqual({ big: "8,287 SF", small: "GLA", icon: "area" });
    expect(prop.flyerPhotos[0]).toBe("/centers/parkwood-commons/assets/g-top.jpg");
  });
  it("every designed centre has flyer copy", () => {
    for (const slug of ["lafayette-hill", "brookwood", "grays-ferry", "parkwood", "parkwood-professional"]) expect(FLYERS[slug]).toBeTruthy();
  });
});

describe("availability: the rent roll decides, the portal describes", () => {
  it("lays the portal's per-suite copy over an available suite only", () => {
    const out = withAvailDesc(
      [suite({ id: "32", status: "available", details: ["In-line"] }), suite({ id: "36", tenant: "Honest" })],
      { "32": { kind: "Medical / office", frontage: "20 ft on Academy Rd", notes: "Restroom\nNew HVAC" }, "36": { kind: "x", frontage: "", notes: "" } },
    );
    expect(out[0]).toMatchObject({ spaceUse: "Medical / office", details: ["In-line", "20 ft on Academy Rd", "Restroom", "New HVAC"] });
    expect(out[1].spaceUse).toBeUndefined();
  });
  it("a marketed vacancy keeps its floor plan through sync; once leased it shows the tenant", () => {
    const s30 = PARKWOOD_COMMONS_SUITES.find((s) => s.id === "30")!;
    const vacant = syncSuites([s30], [{ unitRef: "1100-30", occupantName: "", isVacant: true, sqft: 3025 }]).suites[0];
    expect(vacant).toMatchObject({ status: "available", floorplan: s30.floorplan, spaceName: "Suite 30 · End Cap" });
    const leased = syncSuites([s30], [{ unitRef: "1100-30", occupantName: "New Bank", isVacant: false, sqft: 3025 }]).suites[0];
    expect(leased.status).toBe("leased");
    expect(leased.floorplan).toBeUndefined();
  });
  it("a suite that just went vacant carries no stale marketing", () => {
    const leasedDesign = suite({ id: "36", rollName: "Honest", tenant: "Honest Real Estate", details: ["x"] as string[] });
    const out = syncSuites([leasedDesign], [{ unitRef: "1100-36", occupantName: "", isVacant: true, sqft: 1100 }]).suites[0];
    expect(out).toMatchObject({ status: "available", sf: 1100 });
    expect(out.details).toBeUndefined();
  });
});
