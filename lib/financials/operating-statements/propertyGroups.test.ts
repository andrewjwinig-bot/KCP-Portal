import { describe, it, expect } from "vitest";
import { statementGroupFor, groupStatementOptions } from "./propertyGroups";

describe("statement property grouping", () => {
  it("maps properties and fund rollups to the right group", () => {
    expect(statementGroupFor("1100")).toBe("Shopping Centers"); // retail
    expect(statementGroupFor("3610")).toBe("Office");           // JV III building
    expect(statementGroupFor("PJV3")).toBe("Office");           // JV III fund rollup
    expect(statementGroupFor("PNIPLX")).toBe("Office");         // NI LLC fund rollup
    expect(statementGroupFor("PIIICO")).toBe("Office");         // condo assoc
    expect(statementGroupFor("9800")).toBe("Residential");
    expect(statementGroupFor("PHOMES")).toBe("Residential");    // Korman Homes rollup
    expect(statementGroupFor("2010")).toBe("Other");            // LIK Management
    expect(statementGroupFor("4900")).toBe("Other");            // Office Works
    expect(statementGroupFor("0800")).toBe("Other");            // Land
  });

  it("buckets in fixed order, dropping empty groups, sorted by code", () => {
    const items = [
      { propertyCode: "4900" }, { propertyCode: "3610" }, { propertyCode: "1100" },
      { propertyCode: "2300" }, { propertyCode: "PJV3" },
    ];
    const groups = groupStatementOptions(items);
    expect(groups.map((g) => g.label)).toEqual(["Shopping Centers", "Office", "Other"]); // no Residential
    expect(groups[0].items.map((i) => i.propertyCode)).toEqual(["1100", "2300"]);
    expect(groups[1].items.map((i) => i.propertyCode)).toEqual(["3610", "PJV3"]);
    expect(groups[2].items.map((i) => i.propertyCode)).toEqual(["4900"]);
  });
});
