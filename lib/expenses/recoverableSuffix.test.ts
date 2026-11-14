import { describe, expect, it } from "vitest";
import { recoverableSuffix } from "./invoice";

// 2010 LIK Management has no tenants, so no recoverable -8502 accounts: its
// Office Supplies / Building Maint. card charges code to -8501 (owner, 11/2026).
describe("recoverableSuffix", () => {
  it("2010 codes to -8501", () => expect(recoverableSuffix("2010")).toBe("8501"));
  it("a property with tenants keeps -8502", () => {
    expect(recoverableSuffix("2300")).toBe("8502");
    expect(recoverableSuffix("4050")).toBe("8502");
  });
});
