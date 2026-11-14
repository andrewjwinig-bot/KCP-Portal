import { describe, expect, it } from "vitest";
import { breakdown, propertyTypeOf, type PropertyFigure } from "./breakdown";

const f = (property: string, revenue: number, throughPeriod = 9): PropertyFigure =>
  ({ property, name: property, revenue, opex: 0, noi: revenue / 2, cashFlow: 0, throughPeriod });

describe("portfolio breakdown", () => {
  it("types properties", () => {
    expect(propertyTypeOf("4060")).toBe("Office");
    expect(propertyTypeOf("4500")).toBe("Retail");
    expect(propertyTypeOf("9840")).toBe("Residential");
    expect(propertyTypeOf("PJV3")).toBe("Office");
    expect(propertyTypeOf("4900")).toBe("Office");
    expect(propertyTypeOf("0800")).toBe("Land");
  });

  it("shares revenue by property type, management company out", () => {
    const r = breakdown([f("4060", 600), f("3610", 150), f("4500", 200), f("9840", 50), f("2010", 999)], { metric: "revenue", groupBy: "property_type" });
    expect(r.total).toBe(1000);
    expect(r.excluded).toEqual(["2010"]);
    expect(r.groups.map((g) => [g.group, g.value, g.sharePct])).toEqual([["Office", 750, 75], ["Retail", 200, 20], ["Residential", 50, 5]]);
    expect(r.periodsDiffer).toBe(false);
  });

  it("can include the management company and group by book", () => {
    const r = breakdown([f("4060", 600), f("4500", 400, 8), f("2010", 100)], { metric: "revenue", groupBy: "book", includeManagement: true });
    expect(r.total).toBe(1100);
    expect(r.groups.find((g) => g.group === "Business Parks")?.value).toBe(600);
    expect(r.periodsDiffer).toBe(true);
  });
});
