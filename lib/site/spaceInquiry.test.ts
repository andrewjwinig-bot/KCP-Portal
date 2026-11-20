import { describe, expect, it } from "vitest";
import { checkSpaceInquiry, inquiryAutoReply, inquiryRecipient, inquiryTeamEmail, leadChannel } from "./spaceInquiry";
import { similarSpaces, spacePath, spaceSlug, type SpaceListing } from "./spaces";

const L = (o: Partial<SpaceListing>): SpaceListing => ({
  id: "interplex-4050-309", property: "neshaminy-interplex", space: "Building 5 · Suite 309", size: 1500, minSize: null, maxSize: null,
  term: "Negotiable", rentalRate: "Upon Request", spaceUse: "Office", condition: null, available: "Now", details: [{ text: "Third floor" }],
  images: null, requestMoreInfoEmail: "nfox@kormancommercial.com", contactName: "Nancy Fox", contactPhone: "(215) 244-5175",
  propertyName: "Neshaminy Interplex Business Center", category: "office", city: "Trevose", ...o,
});

describe("space pages", () => {
  it("each space has a stable, URL-safe address from its listing id", () => {
    expect(spaceSlug({ id: "Interplex-4050-309" })).toBe("interplex-4050-309");
    expect(spacePath({ id: "brookwood-1879 A" })).toBe("/site/space/brookwood-1879-a");
  });

  it("suggests the same type, nearest in size, never the space itself", () => {
    const me = L({});
    const all = [me, L({ id: "a", size: 1600 }), L({ id: "b", size: 9000 }), L({ id: "c", size: 1400, category: "retail" }), L({ id: "d", size: 3000 })];
    expect(similarSpaces(me, all, 2).map((s) => s.id)).toEqual(["a", "d"]);
  });
});

describe("the space inquiry form", () => {
  it("needs a name and a real email; a filled honeypot is spam", () => {
    expect(checkSpaceInquiry({ slug: "x", email: "a@b.co" })).toEqual({ ok: false, error: "Please enter your name." });
    expect(checkSpaceInquiry({ slug: "x", name: "Pat", email: "nope" }).ok).toBe(false);
    const spam = checkSpaceInquiry({ slug: "x", name: "Pat", email: "a@b.co", website: "http://spam" });
    expect(spam.ok && spam.spam).toBe(true);
  });

  it("goes to the listing's own leasing contact", () => {
    expect(inquiryRecipient(L({}))).toBe("nfox@kormancommercial.com");
    expect(inquiryRecipient(L({ requestMoreInfoEmail: null }))).toBe("info@kormancommercial.com");
  });

  it("the auto-reply names the space, the contact and the flyer, signed by the contact", () => {
    const c = checkSpaceInquiry({ slug: "interplex-4050-309", name: "Pat Lee", email: "pat@acme.com", phone: "555" });
    if (!c.ok) throw new Error();
    const r = inquiryAutoReply(c.value, L({}), "https://kormancommercial.com/space/interplex-4050-309");
    expect(r.subject).toBe("Thanks for your interest in Building 5 · Suite 309 at Neshaminy Interplex Business Center");
    expect(r.html).toContain("Thanks, Pat");
    expect(r.html).toContain("Nancy Fox");
    expect(r.html).toContain("/space/interplex-4050-309?flyer=1");
    expect(r.text).toContain("1,500 SF");
    const t = inquiryTeamEmail(c.value, L({}), "https://kormancommercial.com/space/interplex-4050-309");
    expect(t.subject).toContain("Pat Lee");
    expect(t.html).toContain("mailto:pat@acme.com");
  });

  it("says where a lead came from", () => {
    expect(leadChannel({ source: "", referrer: "https://www.google.com/" })).toBe("google");
    expect(leadChannel({ source: "Broker-Email", referrer: "" })).toBe("broker-email");
    expect(leadChannel({ source: "", referrer: "" })).toBe("direct");
    expect(leadChannel({ source: "", referrer: "https://www.loopnet.com/x" })).toBe("loopnet");
  });
});
