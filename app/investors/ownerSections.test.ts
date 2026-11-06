import { describe, it, expect } from "vitest";
import { ownerSections } from "./ownerSections";
import { PROPERTY_OWNERSHIP } from "../../lib/properties/ownership";
import type { PropertyOwner } from "../../lib/properties/ownership";

const owner = (id: string, name: string, pct: number, subOwners?: PropertyOwner[]): PropertyOwner =>
  ({ id, name, ownerPct: pct, ...(subOwners ? { subOwners } : {}) }) as PropertyOwner;

describe("ownerSections", () => {
  it("leaves a roster of individuals as one flat, unheaded list", () => {
    const secs = ownerSections([owner("b", "Beta", 0.5), owner("a", "Alpha", 0.5)]);
    expect(secs).toHaveLength(1);
    expect(secs[0].entity).toBeUndefined();
    expect(secs[0].label).toBeUndefined();
    // Untouched: the flat path still sorts where it always did, not here.
    expect(secs[0].owners.map((o) => o.name)).toEqual(["Beta", "Alpha"]);
  });

  it("heads a section with each entity partner and puts direct holders under their own label", () => {
    const secs = ownerSections([
      owner("t2", "Zed Trust", 0.05),
      owner("e1", "Big Co.", 0.8, [owner("s2", "Wendy", 0.6), owner("s1", "Adam", 0.4)]),
      owner("t1", "Ann Trust", 0.15),
    ]);
    expect(secs.map((s) => s.entity?.name ?? s.label)).toEqual(["Big Co.", "Other investors"]);
    expect(secs[0].frac).toBeCloseTo(0.8, 10);
    // The entity's own investors read alphabetically.
    expect(secs[0].owners.map((o) => o.name)).toEqual(["Adam", "Wendy"]);
    // As do the direct holders, whose section carries their combined share.
    expect(secs[1].owners.map((o) => o.name)).toEqual(["Ann Trust", "Zed Trust"]);
    expect(secs[1].frac).toBeCloseTo(0.2, 10);
  });

  it("orders several entity partners by size, largest first", () => {
    const secs = ownerSections([
      owner("small", "Small Co.", 0.2, [owner("x", "X", 1)]),
      owner("big", "Big Co.", 0.8, [owner("y", "Y", 1)]),
    ]);
    expect(secs.map((s) => s.entity!.name)).toEqual(["Big Co.", "Small Co."]);
  });

  it("omits the direct heading when an entity holds the whole property", () => {
    const secs = ownerSections([owner("e", "Whole Co.", 1, [owner("s", "Sam", 1)])]);
    expect(secs).toHaveLength(1);
    expect(secs[0].label).toBeUndefined();
  });

  it("sections 0800 as its K-1 schedule prints, and the sections total the property", () => {
    const p = PROPERTY_OWNERSHIP.find((x) => x.propertyCode === "0800")!;
    const secs = ownerSections(p.owners);
    expect(secs.map((s) => s.entity?.name ?? s.label)).toEqual(["Hyman Korman Co.", "Other investors"]);
    expect(secs[0].frac).toBeCloseTo(0.8, 6);
    expect(secs[0].owners).toHaveLength(24);
    expect(secs[1].frac).toBeCloseTo(0.2, 6);
    expect(secs[1].owners).toHaveLength(14);
    // Nothing is dropped, and nothing is counted twice.
    expect(secs.reduce((s, x) => s + x.frac, 0)).toBeCloseTo(1, 6);
    // An investor's effective interest is their share of the entity x its share
    // of the property — Joan's 26.5496% of HKC is 21.2397% of Bellmawr.
    const joan = secs[0].owners.find((o) => o.detailedName === "JOAN SOHN")!;
    expect((joan.ownerPct ?? 0) * secs[0].frac).toBeCloseTo(0.2123968, 7);
  });
});
