import { describe, it, expect } from "vitest";
import { budgetBooks, bookById, bookForProperty, bookProperties } from "./books";

describe("the budget books", () => {
  it("has the seven books the business actually keeps", () => {
    expect(budgetBooks().map((b) => b.id)).toEqual([
      "shopping-centers", "jv3", "ni-llc", "condo", "korman-homes", "lik", "lik-payroll",
    ]);
  });

  it("puts every shopping centre in the Shopping Centers book", () => {
    const sc = bookById("shopping-centers")!;
    // The eleven the 2026 workbook carries as property tabs.
    expect(sc.properties).toEqual(["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9000", "9510"]);
  });

  it("keeps the fund SHELLS out of their own books — they are entities, not buildings", () => {
    // 4000 is Neshaminy Interplex LLC itself; 3610A is the condo.
    expect(bookById("ni-llc")!.properties).not.toContain("4000");
    expect(bookById("jv3")!.properties).not.toContain("3610A");
    expect(bookById("condo")!.properties).toEqual(["3610A"]);
  });

  it("splits the two office funds, which budget separately", () => {
    expect(bookById("jv3")!.properties).toEqual(["3610", "3620", "3640"]);
    expect(bookById("ni-llc")!.properties).toEqual(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
  });

  it("gathers the residential properties into Korman Homes", () => {
    expect(bookById("korman-homes")!.properties).toEqual(["9800", "9820", "9840", "9860"]);
  });

  it("gives the PAYROLL book no buildings — it is a source, not a portfolio", () => {
    const pay = bookById("lik-payroll")!;
    expect(pay.properties).toEqual([]);
    expect(pay.rollsUp).toBe(false);
    // Its salaries are what Shopping Centers allocates across the centres.
    expect(pay.feeds).toContain("shopping-centers");
  });

  it("answers which book a property's budget lives in", () => {
    expect(bookForProperty("9510")?.id).toBe("shopping-centers");
    expect(bookForProperty("4050")?.id).toBe("ni-llc");
    expect(bookForProperty("3620")?.id).toBe("jv3");
    expect(bookForProperty("9840")?.id).toBe("korman-homes");
    expect(bookForProperty("2010")?.id).toBe("lik");
  });

  it("returns null for a property no book covers yet, rather than guessing", () => {
    // 0800 and the other land parcels are not in a budget book.
    expect(bookForProperty("0800")).toBeNull();
  });

  it("names each property for the tab strip", () => {
    const tabs = bookProperties(bookById("shopping-centers")!);
    expect(tabs.find((t) => t.code === "9510")?.name).toBe("Shops at Lafayette Hill");
    expect(tabs).toHaveLength(11);
  });
});
