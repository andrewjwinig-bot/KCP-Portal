import { describe, it, expect } from "vitest";
import { mergeOpEx } from "./glDerived";
import type { HistoricalOpExEntry } from "./types";

const e = (propertyCode: string, lineLabel: string, source?: string): HistoricalOpExEntry => ({
  propertyCode, lineLabel, yearly: { "2024": 100 }, source, updatedAt: "2026-01-01T00:00:00Z",
});

describe("mergeOpEx — manual (office) history stays authoritative", () => {
  const manual = [e("4080", "Real Estate Taxes"), e("4080", "Insurance")];
  const derived = [
    e("4080", "Real Estate Taxes", "GL import"), // same property → dropped
    e("4500", "Real Estate Taxes", "GL import"), // missing property → added
    e("2070", "Security", "GL import"),          // missing property → added
  ];

  it("keeps every manual entry untouched", () => {
    const out = mergeOpEx(manual, derived);
    expect(out.filter((x) => x.propertyCode === "4080")).toEqual(manual);
  });

  it("adds GL-derived entries only for properties the manual store lacks", () => {
    const out = mergeOpEx(manual, derived);
    const codes = out.map((x) => x.propertyCode).sort();
    expect(codes).toEqual(["2070", "4080", "4080", "4500"]);
    // The GL-derived 4080 line did NOT override or duplicate the manual one.
    expect(out.filter((x) => x.propertyCode === "4080")).toHaveLength(2);
  });

  it("matches property codes case-insensitively", () => {
    const out = mergeOpEx([e("pnIplx", "Utilities")], [e("PNIPLX", "Utilities", "GL import")]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBeUndefined(); // manual kept, derived dropped
  });
});
