import { describe, it, expect } from "vitest";
import { assessedTaxInput, ASSESSED_TAXES, assessedTax } from "./assessedTaxes";

describe("real estate taxes from the assessment notice", () => {
  it("Elbridge (7200) 2027: $2,347,900 × 1.3998% = $32,866, all in March", () => {
    const i = assessedTaxInput(2027, "7200")!;
    expect(i.months![2]).toBe(32866);
    expect(i.months!.reduce((a, b) => a + b, 0)).toBe(32866);
    expect(i.nonRecoverable).toBeUndefined();
  });
  it("Parkwood (7010) 2027: $13,174,000 × 1.3998% = $184,410, all in March", () => {
    const i = assessedTaxInput(2027, "7010")!;
    expect(i.months![2]).toBe(184410);
    expect(i.months!.filter((v) => v).length).toBe(1);
  });
  it("Gray's Ferry (4500) 2027 is three parcels on one line, the billboard out of CAM", () => {
    const i = assessedTaxInput(2027, "4500")!;
    // 13,517,700 → 189,221; 1,642,900 → 22,997; billboard 14,278 + 3% = 14,706 (no notice).
    expect(i.months![2]).toBe(189221 + 22997 + 14706);
    expect(i.nonRecoverable).toEqual({ budget: 14706, basis: 14278, label: "Clear Channel billboard" });
    expect(i.source!.rows.some((r) => /not in CAM/.test(r.label))).toBe(true);
    expect(i.source!.pill).toBe("Per notice");
  });
  it("Hyman Korman Co (5600) 2027: $307,000 × 1.3998% = $4,297 in March", () => {
    expect(assessedTaxInput(2027, "5600")!.months![2]).toBe(4297);
  });
  it("Parkwood Professional (1100) 2027: $1,240,000 × 1.3998% = $17,358 in March", () => {
    expect(assessedTaxInput(2027, "1100")!.months![2]).toBe(17358);
  });
  it("seeds nothing for another year or property", () => {
    expect(assessedTaxInput(2028, "7200")).toBeNull();
    expect(assessedTaxInput(2027, "9510")).toBeNull();
    expect(ASSESSED_TAXES.every((a) => assessedTax(a) > 0)).toBe(true);
  });
});
