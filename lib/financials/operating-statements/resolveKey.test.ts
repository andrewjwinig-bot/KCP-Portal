import { describe, it, expect } from "vitest";
import { resolveKeyIn } from "./resolveKey";
import type { StatementMapping } from "./types";

const m = (propertyCode: string): StatementMapping =>
  ({ propertyCode, entityName: propertyCode, sections: [] } as unknown as StatementMapping);

// Mirrors the real seed's mismatches: a name-key whose propertyCode is a code
// (CONDO/PIIICO, KORMAN HOMES/PHOMES) and fund GLs whose header code matches
// neither (FJVIII → PJV3, FNIPLX → PNIPLX).
const all: Record<string, StatementMapping> = {
  "1100": m("1100"),
  "2010": m("2010"),
  "PJV3": m("PJV3"),
  "PNIPLX": m("PNIPLX"),
  "CONDO": m("PIIICO"),
  "KORMAN HOMES": m("PHOMES"),
};

describe("resolveKeyIn", () => {
  it("resolves direct keys", () => {
    expect(resolveKeyIn(all, "1100")).toBe("1100");
    expect(resolveKeyIn(all, "PJV3")).toBe("PJV3");
  });
  it("resolves a GL code via a mapping's propertyCode", () => {
    expect(resolveKeyIn(all, "PIIICO")).toBe("CONDO");
    expect(resolveKeyIn(all, "PHOMES")).toBe("KORMAN HOMES");
  });
  it("resolves fund-code aliases", () => {
    expect(resolveKeyIn(all, "FJVIII")).toBe("PJV3");
    expect(resolveKeyIn(all, "FNIPLX")).toBe("PNIPLX");
  });
  it("returns null when nothing matches", () => {
    expect(resolveKeyIn(all, "ZZZZ")).toBeNull();
  });
});
