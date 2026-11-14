import { describe, it, expect } from "vitest";
import { composeCurrentRoll, rollAsOf, mergeSameMonth } from "./current";
import { currentSnapshotMonth } from "./snapshot";

// A minimal snapshot: report month + a property per code, each with one unit.
const snap = (reportTo: string, codes: string[]) => ({
  reportTo,
  properties: codes.map((c) => ({
    propertyCode: c,
    totalSqft: 100,
    occupiedSqft: 100,
    vacantSqft: 0,
    units: [{ unitRef: `${c}-1`, occupantName: `Tenant ${c}`, isVacant: false, sqft: 100 }],
  })),
});

describe("composeCurrentRoll", () => {
  it("carries forward properties a later partial import omitted", () => {
    const aug = snap("8/31/2026", ["3610", "4500"]); // office + retail
    const sep = snap("9/30/2026", ["3610"]);          // office-only import
    const composed = composeCurrentRoll([aug, sep])!;
    expect(composed.properties.map((p: any) => p.propertyCode).sort()).toEqual(["3610", "4500"]);
    // retail carried forward from August
    const retail = composed.properties.find((p: any) => p.propertyCode === "4500");
    expect(retail.units[0].occupantName).toBe("Tenant 4500");
  });

  it("uses the newest version of a property present in multiple snapshots", () => {
    const aug = snap("8/31/2026", ["3610"]);
    const sep = snap("9/30/2026", ["3610"]);
    sep.properties[0].units[0].occupantName = "New Office Tenant";
    const composed = composeCurrentRoll([aug, sep])!;
    expect(composed.properties.find((p: any) => p.propertyCode === "3610").units[0].occupantName)
      .toBe("New Office Tenant");
  });

  it("for a full import equals the latest snapshot's property set", () => {
    const aug = snap("8/31/2026", ["3610", "4500"]);
    const sep = snap("9/30/2026", ["3610", "4500"]);
    const composed = composeCurrentRoll([aug, sep])!;
    expect(composed.properties.map((p: any) => p.propertyCode)).toEqual(["3610", "4500"]);
  });

  it("returns null for empty history", () => {
    expect(composeCurrentRoll([])).toBeNull();
  });

  it("ignores stray non-roll objects with no properties", () => {
    const aug = snap("8/31/2026", ["3610", "4500"]);
    const stray = { reportTo: "9/30/2026" } as any; // no properties array
    const composed = composeCurrentRoll([aug, stray])!;
    expect(composed.properties.map((p: any) => p.propertyCode).sort()).toEqual(["3610", "4500"]);
  });
});

describe("the most recent IMPORT is current, not the latest report month", () => {
  // 10/28/26: a November-dated office roll imported in October outranked the
  // full October roll imported after it, so 4900-5002 kept a $775 rent the new
  // roll no longer had, and every retail property read as "not in this month".
  const nov = { ...snap("11/30/2026", ["3610", "4900"]), uploadedAt: "2026-10-15T14:00:00Z" };
  nov.properties[1].units[0].occupantName = "Old 4900";
  const oct = { ...snap("10/31/2026", ["3610", "4500", "4900"]), uploadedAt: "2026-10-28T14:00:00Z" };
  oct.properties[2].units[0].occupantName = "New 4900";

  it("a roll dated ahead of its import never outranks a later import", () => {
    const c = composeCurrentRoll([nov, oct])!;
    expect(c.properties.find((p: any) => p.propertyCode === "4900").units[0].occupantName).toBe("New 4900");
    expect((c as any).reportTo).toBe("10/31/2026");
    expect(currentSnapshotMonth([{ month: "2026-11", ...nov }, { month: "2026-10", ...oct }])).toBe("2026-10");
  });

  it("a backfill of a past month imported today does not dethrone the current roll", () => {
    const sep = { ...snap("9/30/2026", ["4900"]), uploadedAt: "2026-10-29T14:00:00Z" };
    sep.properties[0].units[0].occupantName = "Sept 4900";
    const c = composeCurrentRoll([oct, sep])!;
    expect(c.properties.find((p: any) => p.propertyCode === "4900").units[0].occupantName).toBe("New 4900");
  });

  it("a merged month remembers when each property was imported", () => {
    const m = mergeSameMonth(oct as any, { ...snap("10/31/2026", ["3610"]), uploadedAt: "2026-10-30T12:00:00Z" } as any) as any;
    expect(m.properties.find((p: any) => p.propertyCode === "3610").importedAt).toBe("2026-10-30T12:00:00Z");
  });
});

describe("rollAsOf — the roll a past month is checked against", () => {
  const mar = snap("3/31/2026", ["1100"]);
  const aug = snap("8/31/2026", ["1100"]);
  mar.properties[0].units[0].occupantName = "March tenant";
  aug.properties[0].units[0].occupantName = "August tenant";

  it("uses the latest roll at or before the month", () => {
    expect(rollAsOf([mar, aug], "2026-06")!.properties[0].units[0].occupantName).toBe("March tenant");
    expect(rollAsOf([mar, aug], "2026-09")!.properties[0].units[0].occupantName).toBe("August tenant");
  });

  it("falls back to the EARLIEST roll for a month before any snapshot, not the newest", () => {
    expect(rollAsOf([mar, aug], "2026-01")!.properties[0].units[0].occupantName).toBe("March tenant");
  });

  it("is null for empty history", () => {
    expect(rollAsOf([], "2026-01")).toBeNull();
  });
});


describe("mergeSameMonth — a partial import never erases the rest of its month", () => {
  it("an office-only file over a full September keeps retail and residential", () => {
    const full = snap("9/30/2026", ["3610", "4500", "9800"]);
    const office = snap("9/30/2026", ["3610"]);
    office.properties[0].units[0].occupantName = "Re-imported";
    const merged = mergeSameMonth(full, office);
    expect(merged.properties.map((p: any) => p.propertyCode).sort()).toEqual(["3610", "4500", "9800"]);
    expect(merged.properties.find((p: any) => p.propertyCode === "3610").units[0].occupantName).toBe("Re-imported");
  });
  it("a first import of a month is stored as is", () => {
    const office = snap("9/30/2026", ["3610"]);
    expect(mergeSameMonth(null, office)).toBe(office);
  });
});
