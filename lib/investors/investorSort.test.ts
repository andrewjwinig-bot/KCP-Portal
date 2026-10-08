import { describe, it, expect } from "vitest";
import { compareInvestors, isEntityName, surnameKey } from "./investorSort";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";

describe("surnameKey", () => {
  it("skips middle initials and punctuation", () => {
    expect(surnameKey("Joan R. Sohn")).toBe("SOHN");
    expect(surnameKey("Steven H. Korman")).toBe("KORMAN");
    expect(surnameKey("Judith K. Langsfeld")).toBe("LANGSFELD");
  });

  it("files a maiden or family middle name under the LAST name", () => {
    // How they are addressed, and how a contact list is read.
    expect(surnameKey("Shirley Honickman Hahn")).toBe("HAHN");
    expect(surnameKey("Sidney Jacobs Glass")).toBe("GLASS");
    expect(surnameKey("Alison Korman Feldman")).toBe("FELDMAN");
  });
});

describe("isEntityName", () => {
  it("catches companies, foundations and trusts", () => {
    for (const n of [
      "Hyman Korman Co.", "The Korman Co", "New Eastwick Corporation",
      "Airport Interplex Two, Inc.", "LIK Management, Inc.", "GRAYS FERRY SC ASSOC. INC",
      "The Honickman Foundation", "The Steven H Korman Family Foundation",
      "The Berton E Korman 2012 Family Trust",
    ]) expect(isEntityName(n), n).toBe(true);
  });

  it("leaves people alone, including one whose interest is a trust", () => {
    // Berton's row is named for the PERSON with the trust as its held-as, so
    // he files under Korman with his family rather than in the Misc block.
    for (const n of [
      "Berton E. Korman", "Alison Korman Feldman", "Joan R. Sohn",
      "Shirley Honickman Hahn", "Henry Hahn", "Steven H. Korman",
    ]) expect(isEntityName(n), n).toBe(false);
  });
});

describe("compareInvestors", () => {
  it("orders people by surname, not by first name", () => {
    const sorted = ["Susan Korman Schurr", "Alison Korman Feldman", "Joan R. Sohn"].sort(compareInvestors);
    expect(sorted).toEqual(["Alison Korman Feldman", "Susan Korman Schurr", "Joan R. Sohn"]);
  });

  it("puts every entity after every person", () => {
    const sorted = ["The Korman Co", "Alison Korman Feldman", "Hyman Korman Co.", "Joan R. Sohn"].sort(compareInvestors);
    expect(sorted.slice(0, 2)).toEqual(["Alison Korman Feldman", "Joan R. Sohn"]);
    expect(sorted.slice(2)).toEqual(["Hyman Korman Co.", "The Korman Co"]);
  });

  it("is stable across the live roster — no person lands in the entity block", () => {
    const names = [...new Set(PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => o.name)))];
    const sorted = [...names].sort(compareInvestors);
    const firstEntity = sorted.findIndex(isEntityName);
    if (firstEntity === -1) return;
    for (const n of sorted.slice(firstEntity)) expect(isEntityName(n), n).toBe(true);
  });
});

describe("the roster renders it", () => {
  it("sorts By Investor with compareInvestors and bands the entity block", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const page = readFileSync(join(process.cwd(), "app/investors/page.tsx"), "utf8");
    expect(page).toContain("compareInvestors(a.name, b.name)");
    expect(page).toContain("Misc &mdash; companies &amp; trusts".replace("&mdash; ", "— "));
    // The band draws once, where people end — not on every entity row.
    expect(page).toContain("startsEntities");
  });
});
