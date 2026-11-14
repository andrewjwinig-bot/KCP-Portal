import { describe, it, expect } from "vitest";
import { groupByPropertyType, propertyTypeLabel, PROPERTY_TYPE_GROUPS } from "./typeGroups";
import { PROPERTY_DEFS } from "./data";

const p = (name: string, type: string) => ({ name, type });

describe("property type groups", () => {
  it("orders the sections the way the business reads them, not alphabetically", () => {
    // Alphabetical would be Office, Residential, Shopping Centers — which is
    // not the order anyone thinks in.
    expect(PROPERTY_TYPE_GROUPS.map((g) => g.label)).toEqual(["Office", "Shopping Centers", "Residential"]);
  });

  it("labels Retail as Shopping Centers", () => {
    // The internal type name is not the words a tenant should read.
    expect(propertyTypeLabel("Retail")).toBe("Shopping Centers");
    expect(propertyTypeLabel("Office")).toBe("Office");
    expect(propertyTypeLabel("Land")).toBeNull();
  });

  it("puts every property in its section, in order", () => {
    const groups = groupByPropertyType(
      [p("Bellaire", "Residential"), p("Brookwood", "Retail"), p("Building 1", "Office")],
      (x) => x.type,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([
      ["Office", ["Building 1"]],
      ["Shopping Centers", ["Brookwood"]],
      ["Residential", ["Bellaire"]],
    ]);
  });

  it("never drops a property whose type is unexpected", () => {
    // A building missing from a picker because its type was not anticipated is
    // a bug nobody notices — so it lands in "Other" instead.
    const groups = groupByPropertyType([p("Interstate", "Land"), p("Building 1", "Office")], (x) => x.type);
    expect(groups.map((g) => g.label)).toEqual(["Office", "Other"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Interstate"]);
  });

  it("renders no empty section", () => {
    expect(groupByPropertyType([p("Building 1", "Office")], (x) => x.type).map((g) => g.label)).toEqual(["Office"]);
    expect(groupByPropertyType([], (x: { type: string }) => x.type)).toEqual([]);
  });

  it("covers every property the service request form offers", () => {
    // The form's filter and this grouping must agree: anything the form lists
    // has to land in one of the three named sections, or tenants get an
    // "Other" heading on a public page.
    const submittable = PROPERTY_DEFS.filter(
      (d) => !d.entityKind && (d.type === "Office" || d.type === "Retail" || d.type === "Residential"),
    );
    expect(submittable.length).toBeGreaterThan(10);
    const groups = groupByPropertyType(submittable, (d) => d.type);
    expect(groups.map((g) => g.label)).not.toContain("Other");
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(submittable.length);
  });
});
