import { describe, expect, it } from "vitest";
import { resolveOwnerEmail } from "./ownerEmail";
import { INVESTOR_STRUCTURES } from "./structures";

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

describe("who the PRIMARY address belongs to", () => {
  it("defaults to the investor, so an ordinary record is unchanged", () => {
    const hub = { "lawrence isard": { email: "larry@example.com" } } as any;
    const r = resolveOwnerEmail("Lawrence Isard", null, null, hub);
    expect(r.recipientNames["larry@example.com"]).toBe("Lawrence Isard");
  });

  it("takes the name on the contact record when the address is somebody else's", () => {
    // The case this exists for: plenty of investors have only their
    // accountant's address on file, and that person is who the mail greets.
    const hub = {
      "lawrence isard": { email: "jhoffman@isdanerllc.com", emailName: "Jeff Hoffman" },
    } as any;
    const r = resolveOwnerEmail("Lawrence Isard", null, null, hub);
    expect(r.recipientNames["jhoffman@isdanerllc.com"]).toBe("Jeff Hoffman");
  });

  it("names a per-owner override's address too", () => {
    const hub = { "lawrence isard": { email: "larry@example.com" } } as any;
    const r = resolveOwnerEmail("Lawrence Isard", null, "redirect@example.com", hub);
    expect(r.source).toBe("override");
    expect(r.recipientNames["redirect@example.com"]).toBe("Lawrence Isard");
  });

  it("carries the extra recipients' names alongside the primary's", () => {
    const hub = {
      "lawrence isard": {
        email: "larry@example.com",
        alsoEmail: ["cpa@example.com"],
        alsoNames: { "cpa@example.com": "Jeff Hoffman" },
      },
    } as any;
    const r = resolveOwnerEmail("Lawrence Isard", null, null, hub);
    // ONE map over every address, so no consumer has to know which was primary.
    expect(r.recipientNames).toEqual({
      "larry@example.com": "Lawrence Isard",
      "cpa@example.com": "Jeff Hoffman",
    });
  });

  it("names nobody when there is no address to name", () => {
    const r = resolveOwnerEmail("Nobody At All", null, null, {} as any);
    expect(r.email).toBeNull();
    expect(r.recipientNames).toEqual({});
  });
});

describe("an address resolved THROUGH a trustee is addressed to the trustee", () => {
  const trusteeRows = Object.values(INVESTOR_STRUCTURES)
    .flatMap((st) => st.directory?.rows ?? [])
    .filter((r) => r.email);

  it("has seeded trustee emails to resolve against", () => {
    // Without this the case below passes vacuously.
    expect(trusteeRows.length).toBeGreaterThan(0);
  });

  it("names the trustee, not the beneficiary whose trust they act for", () => {
    // "Dear <the trust's beneficiary>" on a mail to their lawyer reads as a
    // misdirected email — and the directory is exactly the path that resolves
    // an address belonging to someone other than the investor.
    const viaDirectory = trusteeRows
      .map((r) => ({ row: r, res: resolveOwnerEmail(r.name, null, null, {}) }))
      .filter((x) => x.res.source === "trustee-directory");
    expect(viaDirectory.length, "no trustee resolves through the directory").toBeGreaterThan(0);
    for (const { row, res } of viaDirectory) {
      expect(res.recipientNames[res.email!.toLowerCase()]).toBe(row.name);
    }
  });
});
