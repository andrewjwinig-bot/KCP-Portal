import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { coveredOwnerIds, normName } from "./linkCoverage";

/**
 * The guarantee: ONE investor, ONE link, ALL of their K-1s.
 *
 * An investor holding interests in four partnerships must end up with one link
 * and one PIN that shows every document they hold — not four links, and not a
 * link that quietly covers three of the four. Two things can break that, and
 * neither announces itself:
 *
 *  1. `coveredOwnerIds` failing to gather every interest from any one of them,
 *     which shows as a K-1 missing from the portal;
 *  2. the same human keyed under two spellings across properties, which mints
 *     them TWO links — each perfectly functional, each showing half.
 *
 * These run against the REAL ownership roster rather than a fixture, because
 * the failure mode is a data mistake, not a logic one.
 */

const everyOwner = PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => ({ o, code: p.propertyCode })));

/** People holding an interest in more than one property — the case that matters. */
function multiPropertyInvestors() {
  const byName = new Map<string, { name: string; props: Set<string>; ids: string[] }>();
  for (const { o, code } of everyOwner) {
    const k = normName(o.name);
    const hit = byName.get(k) ?? { name: o.name, props: new Set<string>(), ids: [] };
    hit.props.add(code);
    hit.ids.push(o.id);
    byName.set(k, hit);
  }
  return [...byName.values()].filter((x) => x.props.size > 1);
}

describe("one link per investor, covering every property they hold", () => {
  it("has multi-property investors to test against", () => {
    // If this ever hits zero the rest of the file is vacuously passing.
    expect(multiPropertyInvestors().length).toBeGreaterThan(0);
  });

  it("resolves EVERY interest a person holds, from ANY one of them", () => {
    // This is the guarantee itself: the link is minted from whichever
    // partnership you happened to send from, and must still cover the rest.
    for (const person of multiPropertyInvestors()) {
      for (const id of person.ids) {
        const covered = coveredOwnerIds({ ownerId: id, ownerIds: [id], ownerName: person.name });
        for (const expected of person.ids) {
          expect(
            covered,
            `${person.name}: a link minted from ${id} must also cover ${expected}`,
          ).toContain(expected);
        }
      }
    }
  });

  it("covers every PROPERTY they hold, not just the one it was minted from", () => {
    const propsOf = (ids: string[]) =>
      new Set(ids.map((id) => everyOwner.find((x) => x.o.id === id)?.code).filter(Boolean));
    for (const person of multiPropertyInvestors()) {
      const from = person.ids[0];
      const covered = coveredOwnerIds({ ownerId: from, ownerIds: [from], ownerName: person.name });
      expect(propsOf(covered), `${person.name} spans ${[...person.props].join(", ")}`)
        .toEqual(new Set(person.props));
    }
  });

  it("never pulls in a DIFFERENT person", () => {
    // Widening must not become guessing: a link covers exactly one human.
    for (const person of multiPropertyInvestors()) {
      const covered = coveredOwnerIds({ ownerId: person.ids[0], ownerIds: [person.ids[0]], ownerName: person.name });
      for (const id of covered) {
        const hit = everyOwner.find((x) => x.o.id === id);
        expect(hit && normName(hit.o.name)).toBe(normName(person.name));
      }
    }
  });
});

describe("the roster does not split one human across two spellings", () => {
  /** "Lawrence M. Isard" and "Lawrence Isard" reduce alike; the matcher does
   *  NOT unify them, so they would mint two links showing half each. */
  const reduce = (s: string) => {
    const w = normName(s).replace(/[.,]/g, "").split(" ").filter((x) => x.length > 1);
    return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : w.join(" ");
  };

  it("has no two names that look like the same person but resolve apart", () => {
    const byReduced = new Map<string, Set<string>>();
    for (const { o } of everyOwner) {
      const r = reduce(o.name);
      if (!r) continue;
      const set = byReduced.get(r) ?? new Set<string>();
      set.add(normName(o.name));
      byReduced.set(r, set);
    }
    const split = [...byReduced.entries()]
      .filter(([, v]) => v.size > 1)
      .map(([r, v]) => `"${r}" is keyed as ${[...v].map((x) => `"${x}"`).join(" and ")}`);

    // Not a style rule — each of these is an investor who would receive two
    // links, each showing only part of what they hold. Fix the roster spelling
    // rather than relaxing the matcher: a fuzzier match merges genuinely
    // different people, which is the worse failure.
    expect(split, `Investors who would get TWO links:\n  ${split.join("\n  ")}`).toEqual([]);
  });
});
