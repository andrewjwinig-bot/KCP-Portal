import { describe, it, expect } from "vitest";
import { FUND_SF_ALLOC } from "./data";

// Largest-remainder cents split — mirrors allocateCentsByPercents in the CC coder.
function splitCents(totalC: number, shares: Record<string, number>) {
  const floors = Object.entries(shares).map(([k, p]) => {
    const e = totalC * p;
    return { k, c: Math.floor(e), f: e - Math.floor(e) };
  });
  let rem = totalC - floors.reduce((a, b) => a + b.c, 0);
  floors.sort((a, b) => b.f - a.f);
  for (let i = 0; i < floors.length && rem > 0; i++) { floors[i].c += 1; rem -= 1; }
  return Object.fromEntries(floors.map((x) => [x.k, x.c]));
}

describe("FUND_SF_ALLOC (fund-level SF split)", () => {
  it("NI LLC (PNIPLX) covers its 7 buildings and sums to 1", () => {
    const ni = FUND_SF_ALLOC.PNIPLX;
    expect(Object.keys(ni).sort()).toEqual(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"].sort());
    expect(Object.values(ni).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // Bigger building ⇒ bigger share (4080 127,848 > 4060 107,890 > 4070 61,448 sf).
    expect(ni["4080"]).toBeGreaterThan(ni["4060"]);
    expect(ni["4060"]).toBeGreaterThan(ni["4070"]);
  });

  it("JV III (PJV3) covers 3 buildings, sums to 1, and excludes the condo", () => {
    const jv = FUND_SF_ALLOC.PJV3;
    expect(Object.keys(jv).sort()).toEqual(["3610", "3620", "3640"]);
    expect(Object.values(jv).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(jv["3610A"]).toBeUndefined(); // JV III Condo (entityKind) excluded
  });

  it("excludes the NI LLC holding entity (4000)", () => {
    expect(FUND_SF_ALLOC.PNIPLX["4000"]).toBeUndefined();
  });

  it("a $358.99 NI LLC charge splits penny-exact across the buildings", () => {
    const split = splitCents(35899, FUND_SF_ALLOC.PNIPLX);
    expect(Object.values(split).reduce((a, b) => a + b, 0)).toBe(35899);
    // Largest building takes the largest slice.
    const max = Math.max(...Object.values(split));
    expect(split["4080"]).toBe(max);
  });
});
