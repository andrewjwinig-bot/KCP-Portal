import { describe, expect, it } from "vitest";
import { rebuildPropertyCharges } from "./rebuild";
import { ALLOC_SC, expandForAllocation } from "./split";

const c = (o: Partial<{ propertyId: string; amount: number; category: string }>) => ({
  date: "2026-05-02", description: "HOME DEPOT", codedDescription: "", suite: "", category: o.category ?? "BUILDING MAINT.", propertyId: o.propertyId ?? "4500", amount: o.amount ?? 100,
});

describe("expandForAllocation", () => {
  it("splits an SC charge across the centres to the cent", () => {
    const parts = expandForAllocation(c({ propertyId: "SC", amount: 100 }));
    expect(parts.map((p) => p.propertyId).sort()).toEqual(Object.keys(ALLOC_SC).filter((k) => ALLOC_SC[k] > 0).sort());
    expect(Math.round(parts.reduce((a, p) => a + p.amount, 0) * 100)).toBe(10000);
  });
  it("leaves a property's own charge alone", () => expect(expandForAllocation(c({}))).toHaveLength(1));
});

describe("rebuildPropertyCharges", () => {
  it("takes a property's own charges and its share of a split, by category", () => {
    const tx = [c({ amount: 50 }), c({ amount: 25, category: "OFFICE SUPPLIES" }), c({ propertyId: "2300", amount: 999 }), c({ propertyId: "SC", amount: 100 })];
    const r = rebuildPropertyCharges(tx, "4500");
    const share = expandForAllocation(c({ propertyId: "SC", amount: 100 })).find((p) => p.propertyId === "4500")?.amount ?? 0;
    expect(r.total).toBeCloseTo(75 + share, 2);
    expect(r.categoryGroups.map((g) => g.category).sort()).toEqual(["BUILDING MAINT.", "OFFICE SUPPLIES"]);
  });
});
