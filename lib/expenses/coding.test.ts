import { describe, expect, it } from "vitest";
import { cardholderOf, cleanPatch, codingProgress, isRowCoded, type Tx } from "./coding";

const tx = (cardMember: string, coded: Partial<Tx> = {}): Tx => ({
  id: Math.random().toString(36), date: "10/02/2026", cardMember, description: "HOME DEPOT", amount: 42,
  category: "", propertyId: "", suite: "", codedDescription: "", ...coded,
});

describe("credit-card charges go to the cardholder who codes them", () => {
  it("routes by the statement's Card Member — Greg's, Andrew's (Drew), else Harry's", () => {
    expect(cardholderOf("GREGORY KORMAN")).toBe("greg");
    expect(cardholderOf("Greg W")).toBe("greg");
    expect(cardholderOf("ANDREW WINIG")).toBe("drew");
    expect(cardholderOf("HARRY FELDMAN")).toBe("harry");
    expect(cardholderOf("")).toBe("harry");
    // "Andrews" or a merchant word is not Andrew.
    expect(cardholderOf("ANDREWS SUPPLY")).toBe("harry");
  });

  it("counts what each cardholder has coded", () => {
    const p = codingProgress([
      tx("GREGORY KORMAN", { category: "G&A", propertyId: "2010" }), tx("GREGORY KORMAN"),
      tx("ANDREW WINIG", { category: "AUTO", propertyId: "BP & SC" }), tx("HARRY FELDMAN"),
    ]);
    expect(p).toEqual({ greg: { coded: 1, total: 2 }, drew: { coded: 1, total: 1 }, harry: { coded: 0, total: 1 } });
  });

  it("a patch can only change the coding, never the charge itself", () => {
    expect(cleanPatch({ category: "TI", amount: 1, cardMember: "X", suite: 105 })).toEqual({ category: "TI", suite: "105" });
    expect(isRowCoded(tx("G", { category: "TI", propertyId: "4050" }))).toBe(false);
    expect(isRowCoded(tx("G", { category: "TI", propertyId: "4050", suite: "105" }))).toBe(true);
  });
});

describe("who codes where", () => {
  it("Greg codes on his dashboard, not the Credit Card page", async () => {
    const { isPathAllowed, USERS } = await import("../users");
    for (const u of ["greg", "charles", "jay", "maint"] as const) {
      expect(isPathAllowed(u, "/expenses")).toBe(false);
      expect(USERS[u].navKeys.has("expenses")).toBe(false);
    }
    expect(isPathAllowed("harry", "/expenses")).toBe(true);
    expect(isPathAllowed("greg", "/communications")).toBe(true);
  });
});
