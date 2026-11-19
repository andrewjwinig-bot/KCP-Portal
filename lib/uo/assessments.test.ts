import { describe, expect, it } from "vitest";
import { assessmentChanges, cityQuery, lineOne, mergeCity, parseCityRows, resolveAssessed, uoParcels, yearsToCheck } from "./assessments";

// 7010 Parkwood: the budget carries 2026 (11,292,000) and 2027 (13,174,000).
const P = "882078060";

describe("U&O assessed values, every year", () => {
  it("typed beats everything; the budget's year beats the open data", () => {
    expect(resolveAssessed(P, 2027, { [`${P}:2027`]: 13_000_000 }, {}).value).toBe(13_000_000);
    const r = resolveAssessed(P, 2027, {}, { [`${P}:2027`]: 13_174_000 })!;
    expect(r.value).toBe(13_174_000);
    expect(r.cityDiffers).toBeUndefined();
    expect(resolveAssessed(P, 2026, {}, {})!.value).toBe(11_292_000);
  });

  it("a year past the budget's comes from the City's open data", () => {
    const r = resolveAssessed(P, 2028, {}, { [`${P}:2028`]: 14_000_000 })!;
    expect(r.value).toBe(14_000_000);
    expect(r.stale).toBeFalsy();
    expect(r.source).toContain("2028");
  });

  it("a year not certified yet carries the latest known, flagged", () => {
    const r = resolveAssessed(P, 2029, {}, { [`${P}:2028`]: 14_000_000 })!;
    expect(r).toMatchObject({ value: 14_000_000, stale: true, fromYear: 2028 });
    const s = resolveAssessed(P, 2028, {}, {})!;
    expect(s).toMatchObject({ value: 13_174_000, stale: true, fromYear: 2027 });
  });

  it("says when the open data disagrees with a year being filed", () => {
    const r = resolveAssessed(P, 2026, {}, { [`${P}:2026`]: 11_000_000 })!;
    expect(r.value).toBe(11_292_000);
    expect(r.cityDiffers).toBe(11_000_000);
  });

  it("reads the open data and reports what changed", () => {
    const read = parseCityRows([
      { parcel_number: P, year: "2027", market_value: 13174000 },
      { parcel_number: P, year: "2028", market_value: 14000000 },
      { parcel_number: "bad", year: "2028", market_value: 5 },
    ]);
    expect(read).toEqual({ [`${P}:2027`]: 13_174_000, [`${P}:2028`]: 14_000_000 });
    const changes = assessmentChanges({ [`${P}:2027`]: 13_174_000 }, read);
    expect(changes).toEqual([{ parcel: P, year: 2028, before: null, after: 14_000_000, lineBefore: lineOne(13_174_000), lineAfter: lineOne(14_000_000) }]);
    expect(lineOne(13_174_000)).toBe(13_284);
  });

  it("a partial read never forgets a year", () => {
    const merged = mergeCity({ values: { [`${P}:2026`]: 1, [`${P}:2027`]: 2 }, seenAt: {} }, { [`${P}:2027`]: 3 }, "2027-03-01T00:00:00Z");
    expect(merged.values).toEqual({ [`${P}:2026`]: 1, [`${P}:2027`]: 3 });
    expect(merged.seenAt[`${P}:2027`]).toBe("2027-03-01T00:00:00Z");
  });

  it("asks for last year through two years out, on every U&O parcel", () => {
    expect(yearsToCheck("2031-06-01")).toEqual([2030, 2031, 2032, 2033]);
    expect(uoParcels()).toContain("874545940");
    const q = cityQuery(["882078060"], [2030]);
    expect(q).toContain("'882078060'");
    expect(q).toContain("'2030'");
  });
});
