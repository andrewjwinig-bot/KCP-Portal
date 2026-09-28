import { describe, it, expect } from "vitest";
import { assessedTaxInput, ASSESSED_TAXES, assessedTax, phlQueryUrl } from "./assessedTaxes";

const march = (code: string) => assessedTaxInput(2027, code)!.months![2];

describe("real estate taxes from the city's certified assessments", () => {
  it("each notice the owner mailed in: value × 1.3998%, all in March", () => {
    expect(march("7200")).toBe(32866);   // $2,347,900
    expect(march("7010")).toBe(184410);  // $13,174,000
    expect(march("1100")).toBe(17358);   // $1,240,000
    expect(march("5600")).toBe(4297);    // $307,000
    expect(march("8200")).toBe(23655);   // $1,689,900 — Four Seasons only; McDonald's pays its own
    const i = assessedTaxInput(2027, "7010")!;
    expect(i.months!.filter((v) => v).length).toBe(1);
    expect(i.nonRecoverable).toBeUndefined();
  });
  it("the properties with no letter, off the city's open data", () => {
    expect(march("7300")).toBe(54610);   // $3,901,300
    expect(march("1500")).toBe(6014);    // $429,600
    expect(march("9200")).toBe(5510);    // $393,600
  });
  it("Gray's Ferry (4500): three bills, only the shopping centre in CAM", () => {
    const i = assessedTaxInput(2027, "4500")!;
    // 13,517,700 → 189,221; rear 1,642,900 → 22,997; billboard 158,200 → 2,214.
    expect(i.months![2]).toBe(189221 + 22997 + 2214);
    // Out of the pool: this year's rear + billboard (1,613,000 + 215,500 at 1.3998%).
    expect(i.nonRecoverable).toEqual({ budget: 22997 + 2214, basis: 22579 + 3017, label: "Rear Parcel, Clear Channel billboard" });
  });
  it("the 2025 recon's RET pool IS the shopping-centre parcel's tax", () => {
    // $11,387,700 × 1.3998% vs POOL_4500.retAmount $159,405.02.
    expect(Math.abs(11_387_700 * 0.013998 - 159_405.02)).toBeLessThan(1.5);
  });
  it("every figure carries its trail: parcels, links, the query", () => {
    const s = assessedTaxInput(2027, "4500")!.source!;
    expect(s.parcels!.map((p) => p.number)).toEqual(["882051606", "874545940", "885969440"]);
    expect(s.links!.some((l) => l.href === "https://property.phila.gov/?p=885969440")).toBe(true);
    expect(decodeURIComponent(phlQueryUrl(["882051606"], [2026, 2027]))).toContain("'882051606'");
  });
  it("seeds nothing for another year or property", () => {
    expect(assessedTaxInput(2028, "7200")).toBeNull();
    expect(assessedTaxInput(2027, "9510")).toBeNull();
    expect(ASSESSED_TAXES.every((a) => assessedTax(a) > 0)).toBe(true);
  });
});
