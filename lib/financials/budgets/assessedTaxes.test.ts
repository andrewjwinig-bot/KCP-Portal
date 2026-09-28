import { describe, it, expect } from "vitest";
import { assessedTaxInput, ASSESSED_TAXES, assessedTax, phlQueryUrl, billMills } from "./assessedTaxes";

const input = (code: string) => assessedTaxInput(2027, code)!;
const total = (code: string) => input(code).months!.reduce((a, b) => a + b, 0);
const month = (code: string, m: number) => input(code).months![m - 1];

describe("Philadelphia — the city's certified assessments", () => {
  it("each notice the owner mailed in: value × 1.3998%, all in March", () => {
    expect(month("7200", 3)).toBe(32866);   // $2,347,900
    expect(month("7010", 3)).toBe(184410);  // $13,174,000
    expect(month("1100", 3)).toBe(17358);   // $1,240,000
    expect(month("5600", 3)).toBe(4297);    // $307,000
    expect(month("8200", 3)).toBe(23655);   // Four Seasons only; McDonald's pays its own
    expect(input("7010").months!.filter((v) => v).length).toBe(1);
    expect(input("7010").nonRecoverable).toBeUndefined();
  });
  it("the properties with no letter, off the city's open data", () => {
    expect(total("7300")).toBe(54610);
    expect(total("1500")).toBe(6014);
    expect(total("9200")).toBe(5510);
  });
  it("Gray's Ferry (4500): three bills, only the shopping centre in CAM", () => {
    expect(total("4500")).toBe(189221 + 22997 + 2214);
    expect(input("4500").nonRecoverable).toEqual({ budget: 22997 + 2214, basis: 22579 + 3017, label: "Rear Parcel, Clear Channel billboard" });
  });
  it("the 2025 recon's RET pool IS the shopping-centre parcel's tax", () => {
    expect(Math.abs(11_387_700 * 0.013998 - 159_405.02)).toBeLessThan(1.5);
  });
});

describe("Bucks and Montgomery — assessment × each body's millage, on its own bill", () => {
  it("reproduces Montgomery County's own 2026 estimate for Lafayette Hill ($34,727)", () => {
    // county 5,308 + college 476 + Whitemarsh 2,296 + Colonial 26,647, off the county's record.
    const mills2026 = 5.462 + 0.49 + 2.3633 + 27.422;
    expect(Math.round(971_730 * mills2026 / 1000)).toBe(34727);
  });
  it("9510: county + township in May, Colonial SD in September, rates not yet adopted +3%", () => {
    const i = input("9510");
    expect(i.months!.filter((v) => v).length).toBe(2);
    expect(month("9510", 5)).toBe(Math.round(971_730 * (5.462 + 0.49 + 2.3633) * 1.03 / 1000));
    expect(month("9510", 9)).toBe(Math.round(971_730 * 27.422 * 1.03 / 1000));
  });
  it("Bensalem: county + township in April, school in August — 241.5974 mills in 2026", () => {
    const b = ASSESSED_TAXES.find((a) => a.code === "4060")!.jurisdiction.bills;
    expect(b.reduce((s, x) => s + x.levies.reduce((t, l) => t + l.mills, 0), 0)).toBeCloseTo(241.5974, 4);
    expect(month("4060", 4)).toBe(Math.round(483_450 * (29.65 + 23) * 1.03 / 1000));
    expect(month("4060", 8)).toBe(Math.round(483_450 * 188.9474 * 1.03 / 1000));
  });
  it("Kor Center A/B/C split their one parcel 33/28/39 — the whole bill, once", () => {
    const whole = Math.round(269_560 * 241.5974 * 1.03 / 1000);
    const sum = total("40A0") + total("40B0") + total("40C0");
    expect(Math.abs(sum - whole)).toBeLessThanOrEqual(3);
  });
  it("Building 8 carries both of its parcels", () => {
    expect(input("4080").source!.parcels!.length).toBe(2);
  });
  it("mills for the budget year: adopted as-is, the rest +3%", () => {
    const phl = ASSESSED_TAXES.find((a) => a.code === "7200")!.jurisdiction.bills[0];
    expect(billMills(phl)).toBeCloseTo(13.998, 6);
  });
});

describe("every figure carries its trail", () => {
  it("parcels, their county records, and the rates", () => {
    const s = input("4500").source!;
    expect(s.parcels!.map((p) => p.number)).toEqual(["882051606", "874545940", "885969440"]);
    expect(s.links!.some((l) => l.href === "https://property.phila.gov/?p=885969440")).toBe(true);
    expect(decodeURIComponent(phlQueryUrl(["882051606"], [2026, 2027]))).toContain("'882051606'");
    expect(input("9510").source!.links!.some((l) => l.href.includes("propertyrecords.montcopa.org") && l.href.includes("650004654006"))).toBe(true);
    expect(input("4060").source!.links!.some((l) => l.href.includes("Bucks_County_Parcels"))).toBe(true);
    expect(input("4060").source!.links!.some((l) => l.href.includes("buckscounty.gov"))).toBe(true);
  });
  it("seeds nothing for another year or an unknown property", () => {
    expect(assessedTaxInput(2028, "7200")).toBeNull();
    expect(assessedTaxInput(2027, "ZZZZ")).toBeNull();
    expect(assessedTaxInput(2027, "PIIICO")).not.toBeNull(); // the condo's statement key, not 3610A
    expect(assessedTaxInput(2027, "7200")!.source!.formula!.thisYear).toBe(Math.round(2_250_000 * 0.013998));
    expect(ASSESSED_TAXES.every((a) => assessedTax(a) > 0)).toBe(true);
  });
});

import { isDeliberateOverride, withSeedComparison, COMPUTED_TAX_SINCE } from "./assessedTaxes";

describe("a stored tax against the computed one", () => {
  const seed = assessedTaxInput(2027, "1500")!;
  it("a figure stored before the computation shipped is superseded", () => {
    expect(isDeliberateOverride({ months: new Array(12).fill(0), at: "2026-09-20T12:00:00Z" })).toBe(false);
    expect(isDeliberateOverride({ annual: 8659, at: "2026-09-20T12:00:00Z" })).toBe(false);
    expect(isDeliberateOverride({ annual: 8659 })).toBe(false);
  });
  it("$0 is never a deliberate tax on a taxed property", () => {
    expect(isDeliberateOverride({ months: new Array(12).fill(0), at: "2026-10-01T00:00:00Z" })).toBe(false);
  });
  it("a figure typed after it stands, labelled against the computed one", () => {
    const typed = { annual: 7000, at: "2026-10-01T00:00:00Z" };
    expect(isDeliberateOverride(typed)).toBe(true);
    expect(COMPUTED_TAX_SINCE < typed.at).toBe(true);
    const out = withSeedComparison(typed, seed);
    expect(out.source!.pill).toBe("Entered");
    expect(out.source!.total.value).toBe("$986");
  });
  it("accepting the computed figure keeps the computed source", () => {
    const out = withSeedComparison({ months: seed.months!.slice(), at: "2026-10-01T00:00:00Z" }, seed);
    expect(out.source!.pill).toBe("Per city");
  });
});
