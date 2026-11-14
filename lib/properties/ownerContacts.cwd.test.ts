import { describe, it, expect } from "vitest";
import { ownerContact, ownerContactExact } from "./ownerContacts";
import { getOwnersForProperty } from "./ownership";

// These four are CWD partners. The failure mode worth pinning is a contact
// keyed to a name the ROSTER does not use: the lookup then falls through to the
// relaxed match, which a K-1 send flags as "matched on name — check it", or
// misses entirely and the owner shows as having no email.
describe("the Chesterbrook partners' emails", () => {
  const cases: [string, string][] = [
    ["Alec Korman", "ajk@korman.com"],
    ["Jackson Korman", "jkorman@korman.com"],
    ["Nicole Korman", "niki@nikikorman.com"],
    ["The Steven H Korman Family Foundation", "kthomas@korman.com"],
  ];

  it("resolves on the EXACT name, not the relaxed match", () => {
    for (const [name, email] of cases) {
      expect(ownerContactExact(name)?.email).toBe(email);
    }
  });

  it("is keyed to the name the ownership roster actually uses", () => {
    const roster = new Set(getOwnersForProperty("CWD").map((o) => o.name));
    for (const [name] of cases) {
      expect(roster.has(name)).toBe(true);
      expect(ownerContact(name)?.email).toBeTruthy();
    }
  });

  it("leaves the Foundation's greeting as the Foundation, not the contact", () => {
    // `addressAs` leaves a company or a trust its full name. The address is
    // its contact's; no `emailName` means the mail is addressed to the entity.
    expect(ownerContactExact("The Steven H Korman Family Foundation")?.emailName).toBeUndefined();
  });
});
