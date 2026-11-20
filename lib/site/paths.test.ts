import { describe, expect, it } from "vitest";
import { DESIGNED_PAGES, propertyPath } from "./paths";
import { SITE_PROPERTIES } from "./content";

describe("website property links", () => {
  it("send a centre with a designed page there, everything else to its template page", () => {
    expect(propertyPath("retail", "brookwood-shopping-center")).toBe("/centers/brookwood");
    expect(propertyPath("office", "the-office-works-instant-offices")).toBe("/office-works");
    expect(propertyPath("office", "neshaminy-interplex")).toBe("/site/office/neshaminy-interplex");
    expect(propertyPath("retail", "castor-ave-usps")).toBe("/site/retail/castor-ave-usps");
  });
  it("every mapped slug is a real website property", () => {
    const slugs = new Set(SITE_PROPERTIES.map((p) => p.slug));
    for (const s of Object.keys(DESIGNED_PAGES)) expect(slugs.has(s), s).toBe(true);
  });
});
