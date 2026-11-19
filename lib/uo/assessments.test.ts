import { describe, expect, it } from "vitest";
import { alarmDue, assessmentAlarm, missingFor, refreshDue, assessmentChanges, cityQuery, lineOne, mergeCity, parseCityRows, resolveAssessed, uoParcels, yearsToCheck } from "./assessments";

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

describe("once a year, and the alarm when it stops", () => {
  const all = (year: number) => Object.fromEntries(uoParcels().map((p) => [`${p}:${year}`, 1_000_000]));
  const at = (iso: string) => new Date(`${iso}T15:00:00Z`);

  it("the budget's seed covers 2026 and 2027 for every U&O parcel", () => {
    expect(missingFor(2026, {})).toEqual([]);
    expect(missingFor(2027, {})).toEqual([]);
    expect(missingFor(2028, {}).length).toBe(uoParcels().length);
  });

  it("reads from April until next year is in, then stops for the year", () => {
    expect(refreshDue({ values: {} }, at("2027-02-10"))).toBe(false);
    expect(refreshDue({ values: {} }, at("2027-04-02"))).toBe(true);
    expect(refreshDue({ values: {}, checkedAt: "2027-04-02T15:00:00Z" }, at("2027-04-20"))).toBe(false);
    expect(refreshDue({ values: {}, checkedAt: "2027-04-02T15:00:00Z" }, at("2027-05-02"))).toBe(true);
    expect(refreshDue({ values: {}, checkedAt: "2027-10-01T15:00:00Z" }, at("2027-10-08"))).toBe(true);
    expect(refreshDue({ values: all(2028) }, at("2027-06-01"))).toBe(false);
  });

  it("a year with no value reads weekly whatever the month", () => {
    expect(refreshDue({ values: {} }, at("2028-02-01"))).toBe(true);
    expect(refreshDue({ values: {}, checkedAt: "2028-02-01T15:00:00Z" }, at("2028-02-05"))).toBe(false);
  });

  it("warns from October when next year is missing, and is loud once a return is stale", () => {
    expect(assessmentAlarm({ values: {} }, at("2027-09-30"))).toBeNull();
    const w = assessmentAlarm({ values: {} }, at("2027-10-01"))!;
    expect(w).toMatchObject({ level: "warning", year: 2028 });
    expect(w.parcels).toContain("7010 Shopping Center");
    const d = assessmentAlarm({ values: {}, error: "The City's open data answered 500." }, at("2028-01-03"))!;
    expect(d.level).toBe("danger");
    expect(d.text).toContain("answered 500");
    expect(assessmentAlarm({ values: all(2028) }, at("2028-01-03"))).toBeNull();
  });

  it("repeats the alarm every week until it clears", () => {
    expect(alarmDue(undefined, at("2028-01-03"))).toBe(true);
    expect(alarmDue("2028-01-03T15:00:00Z", at("2028-01-08"))).toBe(false);
    expect(alarmDue("2028-01-03T15:00:00Z", at("2028-01-10"))).toBe(true);
  });
});
