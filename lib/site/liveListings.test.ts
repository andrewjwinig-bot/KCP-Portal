import { describe, it, expect } from "vitest";
import { liveListingsFor, liveSiteListings } from "./liveListings";

describe("the website's shopping-centre listings come from the portal, not the CMS copy", () => {
  it("Parkwood Commons lists its vacant suites — not Ferry Good Treats' leased 1,228 SF", async () => {
    const l = await liveListingsFor("parkwood-commons");
    expect(l.map((x) => x.space)).toEqual(["Suite 30 · End Cap", "Suite 32"]);
    expect(l.some((x) => x.size === 1228)).toBe(false);
    expect(l[0].images?.[0].url).toBe("/centers/parkwood-commons/assets/fp-30.jpg");
    expect(l[0].details?.[0].text).toBe("Desirable end-cap at Academy Rd & Byberry Rd");
  });
  it("Parkwood no longer lists 210 (Petroski) and a property with no designed page keeps its CMS listings", async () => {
    const pw = await liveListingsFor("parkwood-shopping-center");
    expect(pw.some((x) => /210/.test(x.space))).toBe(false);
    const all = await liveSiteListings();
    expect(all.filter((x) => x.property === "parkwood-commons")).toHaveLength(2);
  });
});
