import { describe, expect, it } from "vitest";
import { allocate, computeReturn, journalLines, maxTaxOf, sumLines } from "./compute";

// 7010's January 2026 calculation sheet — square feet and status per suite
// (names replaced; the figures are the sheet's).
const SUITES: [string, number, "t" | "v" | "x"][] = [
  ["201", 2471, "t"], ["203", 2157, "t"], ["205", 1000, "v"], ["206", 1220, "v"], ["208", 1075, "v"],
  ["210", 560, "v"], ["212", 1845, "v"], ["214", 740, "v"], ["216", 554, "v"], ["218", 557, "v"],
  ["1230A", 6237, "t"], ["12311", 11211, "v"], ["12315", 3200, "t"], ["12319", 4480, "t"], ["12325", 1440, "t"],
  ["12327", 2048, "t"], ["12329", 1600, "t"], ["12331", 2400, "t"], ["12333", 1260, "t"], ["12337", 1920, "t"],
  ["12339", 1480, "t"], ["12341", 1480, "t"], ["12343", 1440, "t"], ["12345", 1440, "t"], ["12347", 3839, "t"],
  ["12353", 2167, "t"], ["12355", 1152, "v"], ["12357", 3312, "t"], ["12360", 2280, "x"], ["12361", 1456, "x"],
  ["12363", 1988, "t"], ["12375", 3200, "t"],
];
const units = SUITES.map(([s, sqft, k]) => ({ unitRef: `7010-${s}`, tenant: k === "v" ? "Vacant" : `Tenant ${s}`, sqft, vacant: k === "v" }));
const exempt = new Map(SUITES.filter(([, , k]) => k === "x").map(([s]) => [`7010-${s}`, "Exempt"]));
const account = { parcel: "882078060", label: "Shopping Center" };

describe("U&O return", () => {
  it("Line 1 is assessed × 1.21% ÷ 12, as the City rounds it", () => {
    expect(maxTaxOf(11_292_000)).toBe(11_386);   // 7010, October 2026 return
    expect(maxTaxOf(11_387_700)).toBe(11_483);   // 4500 centre
    expect(maxTaxOf(1_613_000)).toBe(1_626);     // 4500 rear parcel
  });

  it("allocates by square feet and adds to Line 1 exactly", () => {
    const a = allocate(11_386, [2471, 2157, 70808]);
    expect(a.reduce((s, n) => s + n, 0)).toBe(11_386);
    expect(a[0]).toBe(373);
  });

  it("reproduces 7010's January 2026 sheet", () => {
    const r = computeReturn({ account, assessed: 11_292_000, units, commonAreas: [{ label: "Hallway", sqft: 2227 }], exempt, delinquent: new Set(), discount: true });
    expect(r.basisSf).toBe(75_436);
    expect(r.lines.maxTax).toBe(11_386);
    // The sheet: vacant 3,006, exempt 900 (incl. the hallway), tax due 7,480.
    expect(Math.abs(r.lines.vacant - 3006)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.lines.exempt - 900)).toBeLessThanOrEqual(2);
    expect(r.lines.taxDue).toBe(r.lines.maxTax - r.lines.vacant - r.lines.exempt);
    expect(Math.abs(r.lines.taxDue - 7480)).toBeLessThanOrEqual(3);
    expect(r.lines.discount).toBe(Math.round(r.lines.beforeDiscount / 100));
    expect(r.rows.find((x) => x.unitRef === "7010-201")!.share).toBe(373);
  });

  it("a delinquent tenant's share comes off Line 8", () => {
    const r = computeReturn({ account, assessed: 11_292_000, units, commonAreas: [{ label: "Hallway", sqft: 2227 }], exempt, delinquent: new Set(["7010-12329"]), discount: false });
    expect(r.lines.delinquent).toBe(241); // the October 2026 return's Line 8
    expect(r.lines.beforeDiscount).toBe(r.lines.taxDue - 241);
    expect(r.lines.discount).toBe(0);
    expect(r.lines.net).toBe(r.lines.beforeDiscount);
  });

  it("a parcel with no tenants files wholly vacant", () => {
    const r = computeReturn({ account: { ...account, noTenants: true }, assessed: 1_613_000, units: [], exempt: new Map(), delinquent: new Set(), discount: true });
    expect(r.lines).toMatchObject({ maxTax: 1626, vacant: 1626, taxDue: 0, net: 0 });
  });

  it("writes the payment JE the team imports: nets to zero, no zero lines", () => {
    const l = (beforeDiscount: number, discount: number) => ({ ...sumLines([]), beforeDiscount, discount, net: beforeDiscount - discount });
    const je = journalLines("2026-10", [{ code: "1100", lines: l(552, 6) }, { code: "7010", lines: l(6437, 0) }, { code: "5600", lines: l(0, 0) }]);
    expect(je.filter((j) => j.property === "1100").map((j) => [j.account, j.amount])).toEqual([["0110-0000", -546], ["2430-0000", 552], ["9190-8501", -6]]);
    expect(je.filter((j) => j.property === "7010").map((j) => j.account)).toEqual(["0110-0000", "2430-0000"]);
    expect(je.some((j) => j.property === "5600")).toBe(false);
    expect(je[0]).toMatchObject({ date: "10/25/2026", description: "October PHL U&O Pmt", reference: "U&O10" });
  });
});
