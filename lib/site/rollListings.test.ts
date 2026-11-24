import { describe, expect, it } from "vitest";
import { interplexListings, officeWorksListings, singleTenantListings, withCmsCopy, isRollProperty } from "./rollListings";

const u = (unitRef: string, sqft: number, isVacant: boolean, occupantName = isVacant ? "Vacant" : "Tenant") => ({ unitRef, sqft, isVacant, occupantName });

describe("the website lists the CURRENT rent roll's vacancies for every non-centre property", () => {
  it("Interplex: every vacant suite in the ten buildings, named by building", () => {
    const l = interplexListings([
      { propertyCode: "3610", units: [u("3610-110", 1200, true), u("3610-120", 900, false)] },
      { propertyCode: "40A0", units: [u("40A0-204", 2500, true)] },
      { propertyCode: "4050", units: [u("4050-309", 800, true)] }, // kept off the website
      { propertyCode: "4900", units: [u("4900-5-019", 199, true)] }, // The Office Works — its own listing
    ], "nfox@kormancommercial.com");
    expect(l.map((x) => [x.space, x.size])).toEqual([["Building 1 · Suite 110", 1200], ["Kor Center A · Suite 204", 2500]]);
    expect(l[0].property).toBe("neshaminy-interplex");
    expect(l[0].details?.map((d) => d.text)).toContain("1st floor");
  });

  it("The Office Works: the plan's open offices, at the roll's SF", () => {
    const l = officeWorksListings([{ propertyCode: "4900", units: [u("4900-5-019", 205, true), u("4900-5-004", 144, false)] }], null);
    expect(l.map((x) => [x.space, x.size, x.term])).toEqual([["Private Office 5-019", 205, "Month-to-month"]]);
    expect(officeWorksListings([], null)).toEqual([]);
  });

  it("single-tenant retail: a vacant suite on its roll, nothing when leased", () => {
    expect(singleTenantListings("castor-ave-save-a-lot", [{ propertyCode: "7200", units: [u("7200-A", 30000, false)] }], null)).toEqual([]);
    const l = singleTenantListings("roosevelt-blvd-k-and-g-fashion-superstore", [{ propertyCode: "7300", units: [u("7300-2", 4000, true)] }], null);
    expect(l.map((x) => [x.space, x.size, x.spaceUse])).toEqual([["Suite 2", 4000, "Retail"]]);
  });

  it("a CMS listing of the same size lends its photos, never its own row", () => {
    const [l] = withCmsCopy(
      singleTenantListings("island-ave", [{ propertyCode: "1500", units: [u("1500-1", 2500, true)] }], null),
      [{ id: "x", property: "island-ave", space: "Old", size: 2500, minSize: null, maxSize: null, term: null, rentalRate: null, spaceUse: null, condition: "Shell", available: null, details: [{ text: "Drive-thru" }], images: [{ url: "/a.jpg", alt: "" }], requestMoreInfoEmail: null }],
    );
    expect(l.space).toBe("Suite 1");
    expect(l.images?.[0].url).toBe("/a.jpg");
    expect(l.condition).toBe("Shell");
    expect(isRollProperty("neshaminy-interplex")).toBe(true);
    expect(isRollProperty("brookwood-shopping-center")).toBe(false);
  });
});
