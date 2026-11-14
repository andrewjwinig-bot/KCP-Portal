import { describe, it, expect } from "vitest";
import { availableStatements, monthlyStatements } from "./mappingStore";

describe("monthly operating statements", () => {
  it("leave out Korman Homes (PHOMES) — it is not imported monthly", async () => {
    const all = await availableStatements();
    const monthly = await monthlyStatements();
    expect(all.some((m) => m.propertyCode === "PHOMES")).toBe(true);   // mapping kept for other pages
    expect(monthly.some((m) => m.propertyCode === "PHOMES")).toBe(false);
    expect(monthly.length).toBe(all.length - 1);
  });
});
