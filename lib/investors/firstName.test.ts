import { describe, it, expect } from "vitest";
import { addressAs } from "./firstName";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";

describe("addressAs", () => {
  it("uses a first name for a person", () => {
    expect(addressAs("Judith K. Langsfeld")).toBe("Judith");
    expect(addressAs("Alison Korman Feldman")).toBe("Alison");
    expect(addressAs("Steven H. Korman")).toBe("Steven");
  });

  it("never shortens a company or a trust", () => {
    // "Email Hyman", "Email The", "Email Berton" each name something that is
    // not the recipient — and the last is a dead man rather than his trust.
    expect(addressAs("Hyman Korman Co.")).toBe("Hyman Korman Co.");
    expect(addressAs("The Korman Co")).toBe("The Korman Co");
    expect(addressAs("The Honickman Foundation")).toBe("The Honickman Foundation");
    expect(addressAs("Berton E. Korman", "Berton E Korman TUA Dtd 02232018")).toBe("Berton E. Korman");
    expect(addressAs("LIK Management, Inc.")).toBe("LIK Management, Inc.");
    expect(addressAs("GRAYS FERRY SC ASSOC. INC")).toBe("GRAYS FERRY SC ASSOC. INC");
  });

  it("holds up across the live roster — no shortened name loses its identity", () => {
    // Whatever it returns must be a prefix of the real name, so the button can
    // never address someone the roster does not call that.
    for (const p of PROPERTY_OWNERSHIP) {
      for (const o of p.owners) {
        const label = addressAs(o.name, o.detailedName);
        expect(o.name.startsWith(label), `${o.name} -> ${label}`).toBe(true);
        expect(label.length).toBeGreaterThan(1);
      }
    }
  });

  it("copes with an empty or one-word name", () => {
    expect(addressAs("")).toBe("");
    expect(addressAs("Cher")).toBe("Cher");
  });
});
