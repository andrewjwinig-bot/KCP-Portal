import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { coveredOwnerIds, normName } from "./linkCoverage";
import { partnershipName } from "./partnershipName";

const k1Rows = PROPERTY_OWNERSHIP
  .filter((p) => p.hasK1Distribution)
  .flatMap((p) => p.owners.map((o) => ({ code: p.propertyCode, id: o.id, name: o.name })));

const byPerson = () => {
  const m = new Map<string, typeof k1Rows>();
  for (const r of k1Rows) m.set(normName(r.name), [...(m.get(normName(r.name)) ?? []), r]);
  return m;
};

describe("ONE link per investor carries ALL of their K-1s", () => {
  it("a link minted on any one interest reaches every other interest they hold", () => {
    // The promise the whole design rests on: an investor holds one link and
    // one PIN, and every K-1 they receive appears behind it. Coverage is
    // resolved through the PERSON at read time, so a partnership keyed in
    // after the link was minted still appears on it — which is the case that
    // broke before, when 0800 was added and every existing link silently
    // stopped covering its holders' new rows.
    const failures: string[] = [];
    for (const [, group] of byPerson()) {
      // Mint on the FIRST interest only, as a real link is.
      const covered = new Set(coveredOwnerIds({
        ownerId: group[0].id, ownerIds: [group[0].id], ownerName: group[0].name,
      }));
      const missed = group.filter((g) => !covered.has(g.id));
      if (missed.length) failures.push(`${group[0].name} → ${missed.map((m) => m.code).join(", ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("covers the worked case — one person, K-1s from fifteen partnerships", () => {
    const g = byPerson().get(normName("Alison Korman Feldman"))!;
    expect(g.length).toBeGreaterThanOrEqual(15);
    const covered = new Set(coveredOwnerIds({ ownerId: g[0].id, ownerIds: [g[0].id], ownerName: g[0].name }));
    for (const r of g) expect(covered.has(r.id), `${r.code} not covered`).toBe(true);
  });

  it("does NOT pool separate people behind one link", () => {
    // Widening is by exact normalised name. Two different people must never
    // land on one link — that would show one investor another's K-1.
    const covered = coveredOwnerIds({
      ownerId: k1Rows.find((r) => r.name === "Steven H. Korman")!.id,
      ownerIds: [k1Rows.find((r) => r.name === "Steven H. Korman")!.id],
      ownerName: "Steven H. Korman",
    });
    const names = new Set(
      PROPERTY_OWNERSHIP.flatMap((p) => p.owners).filter((o) => covered.includes(o.id)).map((o) => normName(o.name)),
    );
    expect([...names]).toEqual(["steven h. korman"]);
  });
});

describe("the issuing partnership has a NAME on investor-facing pages", () => {
  it("never shows an investor a raw code", () => {
    // The portal and the share email named the partnership from PROPERTY_DEFS
    // alone, so an entity that files a return without being a building in the
    // directory came out as "WHIT" or "CWD" — on the investor's own page and
    // in the email announcing it.
    for (const p of PROPERTY_OWNERSHIP.filter((x) => x.hasK1Distribution)) {
      expect(partnershipName(p.propertyCode), p.propertyCode).not.toBe(p.propertyCode);
    }
  });

  it("prefers the ownership record's own label over the directory", () => {
    expect(partnershipName("WHIT")).toBe("Whitpain Associates");
    expect(partnershipName("CWD")).toBe("Cherrywood Joint Venture");
    expect(partnershipName("4510")).toBe("Grays Ferry SC Assoc., Inc. (GP)");
    expect(partnershipName("0300")).toBe("Airport Interplex Two, Inc.");
  });
});
