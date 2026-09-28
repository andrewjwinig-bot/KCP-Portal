import { describe, it, expect } from "vitest";
import { assessedTaxInput, ASSESSED_TAXES, assessedTax } from "./assessedTaxes";

describe("real estate taxes from the assessment notice", () => {
  it("Elbridge (7200) 2027: $2,347,900 × 1.3998% = $32,866, all in March", () => {
    const i = assessedTaxInput(2027, "7200")!;
    expect(i.months![2]).toBe(32866);
    expect(i.months!.reduce((a, b) => a + b, 0)).toBe(32866);
  });
  it("Parkwood (7010) 2027: $13,174,000 × 1.3998% = $184,410, all in March", () => {
    const i = assessedTaxInput(2027, "7010")!;
    expect(i.months![2]).toBe(184410);
    expect(i.months!.filter((v) => v).length).toBe(1);
  });
  it("seeds nothing for another year or property", () => {
    expect(assessedTaxInput(2028, "7200")).toBeNull();
    expect(assessedTaxInput(2027, "9510")).toBeNull();
    expect(ASSESSED_TAXES.every((a) => assessedTax(a) > 0)).toBe(true);
  });
});
