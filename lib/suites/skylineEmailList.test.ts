import { describe, it, expect } from "vitest";
import { isSkylineEmailList, parseSkylineEmailList } from "./skylineEmailList";

// Synthetic rows in the shape Skyline's Email List exports — never real tenants.
const rows: unknown[][] = [
  ["", "This report just copied the email addresses listed below for the occupants you selected to the Windows Clipboard.", "", "", "", ""],
  ["", "", "", "", "", ""],
  ["9999-1", "", "", "Acme Widgets <Billing@Acme-Test.Com>; ", "", ""],
  ["9999-1", "", "", "<billing@acme-test.com>;", "", ""],
  ["9999-1", "", "", "<ap@acme-test.com;owner@acme-test.com>;", "", ""],
  ["9999-2", "", "", "Beta Co <pay@beta.test (p) 215-555-0100>; ", "", ""],
  ["9999-3", "", "", "<See Main Record>;", "", ""],
  ["9999-4", "", "", "<one@gamma.test; broken@gamma>;", "", ""],
  ["2000-4500", "", "", "Our Own Entity (4500) <ap@korman.test>; ", "", ""],
];

describe("Skyline Email List", () => {
  it("recognises the report", () => {
    expect(isSkylineEmailList(rows)).toBe(true);
    expect(isSkylineEmailList([["Unit Ref", "Tenant", "Email"], ["9999-1", "A", "a@b.co"]])).toBe(false);
  });

  it("one entry per suite: every distinct address, cleaned and lower-cased", () => {
    const out = parseSkylineEmailList(rows);
    expect(out.map((e) => e.unitRef)).toEqual(["9999-1", "9999-2", "9999-4"]);
    expect(out[0].emails).toEqual(["billing@acme-test.com", "ap@acme-test.com", "owner@acme-test.com"]);
    expect(out[1]).toEqual({ unitRef: "9999-2", emails: ["pay@beta.test"], bad: [] }); // phone dropped
    expect(out[2]).toEqual({ unitRef: "9999-4", emails: ["one@gamma.test"], bad: ["broken@gamma"] });
  });

  it("leaves out 2000's intercompany entities and 'See Main Record'", () => {
    const refs = parseSkylineEmailList(rows).map((e) => e.unitRef);
    expect(refs).not.toContain("2000-4500");
    expect(refs).not.toContain("9999-3");
  });
});
