import { describe, expect, it } from "vitest";
import { resolveOwnerEmail } from "./ownerEmail";

describe("resolveOwnerEmail", () => {
  it("an entered address always wins", () => {
    const r = resolveOwnerEmail("Alison Korman Feldman", null, "someone.else@example.com");
    expect(r).toMatchObject({ email: "someone.else@example.com", source: "override" });
  });

  it("ignores a blank override rather than treating it as an address", () => {
    expect(resolveOwnerEmail("Alison Korman Feldman", null, "   ").source).not.toBe("override");
  });

  it("finds an exact owner-contact match", () => {
    const r = resolveOwnerEmail("Alison Korman Feldman", null, null);
    expect(r).toMatchObject({ email: "akorman@kormancommercial.com", source: "contacts" });
  });

  it("recovers a name the contacts file records differently", () => {
    // Contacts have "catherine altman"; the K-1 roster says "Catherine Korman
    // Altman". Same person, and the short key resolves to exactly one address.
    const r = resolveOwnerEmail("Catherine Korman Altman", null, null);
    expect(r.email).toBeTruthy();
    expect(r.source).not.toBe("none");
  });

  it("says so rather than guessing when nothing matches", () => {
    const r = resolveOwnerEmail("Nobody In Particular", null, null);
    expect(r).toMatchObject({ email: null, source: "none" });
  });

  it("does not invent an address from a single-word name", () => {
    expect(resolveOwnerEmail("Korman", null, null).email).toBeNull();
  });

  it("keeps two interests of one person independently addressable", () => {
    const trust = resolveOwnerEmail("Alison Korman Feldman", "LIK GST TR FBO Alison Feldman", "trustee@example.com");
    const personal = resolveOwnerEmail("Alison Korman Feldman", null, null);
    expect(trust.email).toBe("trustee@example.com");
    expect(personal.email).not.toBe("trustee@example.com");
  });
});
