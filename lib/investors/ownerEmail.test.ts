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

// ── The contact hub is the same source of truth as the investor's row ──────
//
// Lawrence Isard's email and his accountant's were entered on his contact card
// and stored as overrides — he has no row in the static seed. The share dialog
// still offered "Add email", because the send path read only the seed. These
// pin that the hub's record IS the record.
describe("resolveOwnerEmail — contact-hub records", () => {
  const hub = {
    "lawrence isard": { email: "jhoffman@example.com", alsoEmail: ["larry.isard@example.com"] },
  };

  it("resolves an investor whose details exist only in the hub", () => {
    const r = resolveOwnerEmail("Lawrence Isard", null, null, hub);
    expect(r.email).toBe("jhoffman@example.com");
    expect(r.source).toBe("contacts");
    expect(r.note).toBe("Owner contacts");
  });

  it("carries the hub's additional recipients", () => {
    expect(resolveOwnerEmail("Lawrence Isard", null, null, hub).alsoEmail).toEqual(["larry.isard@example.com"]);
  });

  it("still finds them when the roster name carries a middle name", () => {
    const r = resolveOwnerEmail("Lawrence R Isard", null, null, hub);
    expect(r.email).toBe("jhoffman@example.com");
    expect(r.note).toBe("Matched on name — check it");
  });

  it("keeps the extra recipients when a per-interest override redirects the mail", () => {
    const r = resolveOwnerEmail("Lawrence Isard", null, "trustee@example.com", hub);
    expect(r.email).toBe("trustee@example.com");
    expect(r.source).toBe("override");
    expect(r.alsoEmail).toEqual(["larry.isard@example.com"]);
  });

  it("lets the hub correct a seeded address rather than being shadowed by it", () => {
    const r = resolveOwnerEmail("Alison Korman Feldman", null, null, { "alison korman feldman": { email: "new@example.com" } });
    expect(r.email).toBe("new@example.com");
  });

  it("without the hub, resolves nobody — which is the bug this replaced", () => {
    expect(resolveOwnerEmail("Lawrence Isard", null, null).email).toBeNull();
  });
});
