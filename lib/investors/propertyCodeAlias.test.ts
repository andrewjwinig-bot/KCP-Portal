import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codesFor, isSameProperty, canonicalPropertyCode } from "./propertyCodeAlias";
import { partnershipName } from "./partnershipName";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a corrected property code does not strand what is already filed", () => {
  it("matches a document stored under the old spelling to the current roster", () => {
    // The failure this exists for: HKCo shipped briefly as "HKC", 24 K-1s were
    // uploaded in that window, and the card read "K-1 0/24" while every row
    // under it showed VIEW.
    expect(isSameProperty("HKC", "HKCo")).toBe(true);
    expect(isSameProperty("HKCo", "HKCo")).toBe(true);
    expect(codesFor("HKCo")).toContain("HKC");
  });

  it("is case-insensitive, since a code is typed by hand in places", () => {
    expect(isSameProperty("hkc", "HKCo")).toBe(true);
    expect(isSameProperty("HKC", "hkco")).toBe(true);
  });

  it("never matches two DIFFERENT partnerships", () => {
    // The whole risk of an alias: one partnership's K-1s counted under
    // another's roster would put a document on the wrong card.
    expect(isSameProperty("HKC", "7010")).toBe(false);
    expect(isSameProperty("0800", "HKCo")).toBe(false);
    expect(codesFor("7010")).toEqual(["7010"]);
  });

  it("resolves an aliased code to the entity's real name, not the raw code", () => {
    // Otherwise an investor's own page reads "HKC 2025 Schedule K-1".
    expect(partnershipName("HKC")).toBe("Hyman Korman Company");
    expect(partnershipName("HKCo")).toBe("Hyman Korman Company");
    expect(canonicalPropertyCode("HKC")).toBe("HKCo");
    expect(canonicalPropertyCode("7010")).toBe("7010");
  });

  it("every alias target is a real roster entry", () => {
    // An alias pointing at nothing silently hides documents instead of
    // surfacing them.
    const codes = new Set(PROPERTY_OWNERSHIP.map((p) => p.propertyCode.toUpperCase()));
    expect(codes.has("HKCO")).toBe(true);
  });

  it("EVERY code-based document reader goes through the alias", () => {
    // A reader left on `===` fails on its own: the count reads empty, or the
    // year list does, or a name falls through to the raw code. They have to
    // agree or the roster and the portal disagree about what exists.
    for (const [file, expected] of [
      ["lib/investors/k1Store.ts", 2],
      ["lib/investors/taxDocStore.ts", 2],
      ["app/api/investor-k1/route.ts", 1],
    ] as const) {
      const src = read(file);
      expect(src.match(/isSameProperty\(/g)?.length, `${file}: readers via the alias`).toBe(expected);
      expect(src, `${file}: a raw d.propertyCode === comparison is left`).not.toMatch(/d\.propertyCode === /);
    }
    expect(read("lib/investors/partnershipName.ts")).toMatch(/canonicalPropertyCode\(code\)/);
  });
});
