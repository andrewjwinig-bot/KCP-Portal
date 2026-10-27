import { describe, expect, it } from "vitest";
import { officeLabel, officesFromRoll, sizeRange } from "./offices";

const u = (unitRef: string, sqft: number, occupantName = "") =>
  ({ unitRef, sqft, occupantName, isVacant: !occupantName });

describe("Office Works offices come from the 4900 rent roll", () => {
  it("names Building Five's offices as the page does", () => {
    expect(officeLabel("4900-5019")).toBe("5-019");
    expect(officeLabel("4900-5-26")).toBe("5-026");
    expect(officeLabel("4900-CONF")).toBe("CONF");
  });
  it("lists only the vacant offices, at the roll's SF, numbered in order", () => {
    const out = officesFromRoll([u("4900-5032", 141), u("4900-5019", 199.4), u("4900-5020", 160, "Acme"), u("4900-5026", 0)]);
    expect(out).toEqual([{ id: "5-019", sf: 199, m2m: true }, { id: "5-032", sf: 141 }]);
  });
  it("never offers the reception area, conference rooms or other shared space", () => {
    const out = officesFromRoll([
      u("4900-5019", 199), u("4900-CONF", 400), u("4900-5001", 900, "Reception Area"),
      u("4900-5002", 380, "Conference Room A"), { ...u("4900-5003", 120), amenity: true },
    ]);
    expect(out.map((o) => o.id)).toEqual(["5-019"]);
    expect(sizeRange([u("4900-5019", 199), u("4900-5001", 900, "Reception"), u("4900-5026", 130)])).toBe("130–199");
  });
  it("reads the size range over every office, leased or not", () => {
    expect(sizeRange([u("4900-5019", 199), u("4900-5020", 460, "Acme"), u("4900-5026", 130)])).toBe("130–460");
    expect(sizeRange([])).toBe("130–460");
  });
});
