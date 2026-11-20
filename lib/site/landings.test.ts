import { describe, expect, it } from "vitest";
import { SITE_PROPERTIES } from "./content";
import { LANDINGS, landingListings } from "./landings";

describe("search landing pages", () => {
  it("name only real website properties of their own type", () => {
    const bySlug = new Map(SITE_PROPERTIES.map((p) => [p.slug, p]));
    for (const l of LANDINGS) for (const s of l.properties ?? []) {
      expect(bySlug.get(s), `${l.slug} → ${s}`).toBeTruthy();
      expect(bySlug.get(s)!.category).toBe(l.category);
    }
    expect(new Set(LANDINGS.map((l) => l.slug)).size).toBe(LANDINGS.length);
  });

  it("list the live spaces that answer them, smallest first on a size page", () => {
    const L = (id: string, property: string, category: string, size: number) =>
      ({ id, property, category, size, minSize: null, maxSize: null } as never);
    const all = [L("a", "neshaminy-interplex", "office", 4000), L("b", "neshaminy-interplex", "office", 900),
      L("c", "the-office-works-instant-offices", "office", 150), L("d", "brookwood-shopping-center", "retail", 1200)];
    const small = LANDINGS.find((l) => l.slug === "small-office-space-bucks-county")!;
    expect(landingListings(small, all).map((x: { id: string }) => x.id)).toEqual(["c", "b"]);
    const bensalem = LANDINGS.find((l) => l.slug === "retail-space-bensalem-pa")!;
    expect(landingListings(bensalem, all).map((x: { id: string }) => x.id)).toEqual(["d"]);
  });
});
