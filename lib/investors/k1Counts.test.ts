import { describe, it, expect } from "vitest";
import { k1CountFor } from "./k1Counts";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";

const I = (propertyCode: string, hasK1Distribution: boolean, ownerId: string) =>
  ({ propertyCode, hasK1Distribution, ownerId });

describe("k1CountFor", () => {
  it("counts only partnerships that distribute K-1s", () => {
    const c = k1CountFor([I("7010", true, "a"), I("LAND", false, "b"), I("0800", true, "c")], new Set());
    expect(c.expected).toBe(2);
    expect(c.missing).toEqual(["7010", "0800"]);
  });

  it("collected is null — not zero — until the uploaded set is known", () => {
    // Nothing loaded yet reads as "none collected" if this returns 0, which is
    // the one answer that looks like a problem when there isn't one.
    const c = k1CountFor([I("7010", true, "a")], null);
    expect(c.collected).toBeNull();
    expect(c.expected).toBe(1);
  });

  it("counts an investor's own K-1s, not their partnerships'", () => {
    const c = k1CountFor(
      [I("7010", true, "a"), I("0800", true, "b"), I("2300", true, "c"), I("4500", true, "d")],
      new Set(["a", "c"]),
    );
    expect(c.collected).toBe(2);
    expect(c.expected).toBe(4);
    expect(c.missing).toEqual(["0800", "4500"]);
  });

  it("an investor with no distributing interest expects none", () => {
    const c = k1CountFor([I("LAND", false, "a")], new Set(["a"]));
    expect(c.expected).toBe(0);
    expect(c.collected).toBe(0);
    expect(c.missing).toEqual([]);
  });

  it("two interests in ONE partnership are two K-1s, not one", () => {
    // Alison holds both a GST trust interest and a personal one at 7010. They
    // are separate documents with separate owner ids, and collapsing them by
    // property would report one K-1 outstanding when two are.
    const c = k1CountFor([I("7010", true, "trust"), I("7010", true, "personal")], new Set(["trust"]));
    expect(c.expected).toBe(2);
    expect(c.collected).toBe(1);
    expect(c.missing).toEqual(["7010"]);
  });
});

describe("against the live roster", () => {
  // Every K-1 an investor is counted for must be an interest they hold
  // DIRECTLY. A sub-owner's K-1 is issued by the entity above, not by the
  // property, so a flattened tree would inflate the count — and the id would
  // not be an upload target either.
  it("only direct partners are counted as receiving a property's K-1", () => {
    const direct = new Set(
      PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => `${p.propertyCode}:${o.id}`)),
    );
    const subs = PROPERTY_OWNERSHIP.flatMap((p) =>
      p.owners.flatMap((o) => (o.subOwners ?? []).map((s) => `${p.propertyCode}:${s.id}`)),
    );
    expect(subs.length).toBeGreaterThan(0); // the case is real, not hypothetical
    for (const s of subs) expect(direct.has(s)).toBe(false);
  });

  it("every counted interest's id is unique to its property", () => {
    // An id is a K-1 upload target: two properties sharing one would put a
    // second partnership's K-1 in an investor's collected count.
    const ids = PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
