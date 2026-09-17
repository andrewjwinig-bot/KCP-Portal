import { describe, it, expect } from "vitest";
import { deriveContributions, overallProgress, ownerProgress, kindProgress, type BudgetProperty } from "./deriveContributions";
import type { InPlaceRevenueRecord } from "./inPlaceStore";

const props: BudgetProperty[] = [
  { code: "9510", name: "Shops at Lafayette Hill", allocGroup: "SC" },
  { code: "3610", name: "Interplex 1", allocGroup: "BP" },
];

const charge = (propertyCode: string, unitRef: string, tenant: string, month: number) => ({
  propertyCode, unitRef, tenant, month, chargeCode: "RNT", glAccount: "4230-8501", amount: 1000, chargeDate: null,
});

const rec = (charges: InPlaceRevenueRecord["charges"]): InPlaceRevenueRecord => ({
  year: 2027, category: "Shopping Centers", charges, properties: ["9510"], missing: [], skipped: [],
  chargeCodes: ["RNT"], importedAt: "", importedBy: "", fileName: "",
});

describe("what a budget still needs, derived", () => {
  it("asks each property for a tax, an insurance and a maintenance figure", () => {
    const items = deriveContributions(2027, props, null);
    // Nothing per-space without a schedule, but the three per-property parts
    // are needed whether or not anything changed.
    expect(items).toHaveLength(6);
    expect(new Set(items.map((c) => c.kind))).toEqual(new Set(["ret", "insurance", "building-maintenance"]));
  });

  it("separates a VACANCY from a RENEWAL, because they are different questions", () => {
    const items = deriveContributions(2027, props, rec([
      // No contracted rent at all → will it re-let, when, at what?
      // (absent from the schedule entirely is not derivable; a unit present
      //  with only some months is the expiring case)
      ...[1, 2, 3, 4, 5, 6].map((m) => charge("9510", "9510-406", "Wawa", m)),
      ...Array.from({ length: 12 }, (_, i) => charge("9510", "9510-420", "Lafayette Hill Cleaners", i + 1)),
    ]));
    const perSpace = items.filter((c) => c.unitRef);
    expect(perSpace).toHaveLength(1);
    expect(perSpace[0].kind).toBe("renewal");       // stops in June
    expect(perSpace[0].unitRef).toBe("9510-406");
    // The fully-contracted tenant needs nothing.
    expect(items.some((c) => c.unitRef === "9510-420")).toBe(false);
  });

  it("routes each part to its owner — Harry retail, Nancy office, Greg maintenance, Drew tax", () => {
    const items = deriveContributions(2027, props, rec(
      [1, 2].map((m) => charge("9510", "9510-406", "Wawa", m)),
    ));
    const owner = (kind: string, code: string) => items.find((c) => c.kind === kind && c.propertyCode === code)?.owner;
    expect(items.find((c) => c.unitRef === "9510-406")?.owner).toBe("harry");
    expect(owner("building-maintenance", "9510")).toBe("greg");
    expect(owner("ret", "9510")).toBe("drew");
    expect(owner("insurance", "3610")).toBe("drew");
  });

  it("carries completion in from the stored map and nowhere else", () => {
    const first = deriveContributions(2027, props, null);
    const id = first[0].id;
    const items = deriveContributions(2027, props, null, { [id]: { filledAt: "2026-10-01T00:00:00Z", filledBy: "drew" } });
    const hit = items.find((c) => c.id === id)!;
    expect(hit.filledAt).toBe("2026-10-01T00:00:00Z");
    expect(hit.filledBy).toBe("drew");
    expect(overallProgress(items)).toEqual({ total: 6, done: 1, pct: 17 });
  });

  it("orders owners WORST FIRST — the bar points at what is in the way", () => {
    const items = deriveContributions(2027, props, null);
    const rows = ownerProgress(items);
    // Drew owns RET + insurance at both properties (4); Greg maintenance (2).
    expect(rows[0].owner).toBe("drew");
    expect(rows[0].open).toBe(4);
    expect(rows[1].owner).toBe("greg");
  });

  it("says WHAT is outstanding, not only how much", () => {
    expect(kindProgress(deriveContributions(2027, props, null))).toEqual({
      ret: 2, insurance: 2, "building-maintenance": 2,
    });
  });

  it("re-deriving after a better import changes the list by itself", () => {
    const before = deriveContributions(2027, props, rec([charge("9510", "9510-406", "Wawa", 1)]));
    const after = deriveContributions(2027, props, rec(
      Array.from({ length: 12 }, (_, i) => charge("9510", "9510-406", "Wawa", i + 1)),
    ));
    expect(before.some((c) => c.unitRef === "9510-406")).toBe(true);
    expect(after.some((c) => c.unitRef === "9510-406")).toBe(false);
  });
});
