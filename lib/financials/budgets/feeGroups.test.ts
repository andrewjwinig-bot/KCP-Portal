import { describe, it, expect } from "vitest";
import { feeGroupOf, feeGroups } from "./feeGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";

describe("2010's fee revenue by book, as the LIK workbook lays it out", () => {
  const code = (f: (p: (typeof PROPERTY_DEFS)[number]) => boolean) => PROPERTY_DEFS.find(f)!.id;
  it("groups each building under its book", () => {
    expect(feeGroupOf(code((p) => p.fundGroup === "JV III"))).toBe("JV III");
    expect(feeGroupOf(code((p) => p.fundGroup === "NI LLC"))).toBe("NI LLC");
    expect(feeGroupOf("9510")).toBe("Shopping Centers");
    expect(feeGroupOf(code((p) => p.type === "Residential"))).toBe("Residential");
  });
  it("the groups add back to every building's fee, Residential shown even at $0", () => {
    const m = (v: number) => new Array(12).fill(v);
    const rows = [{ code: "9510", months: m(100) }, { code: "4500", months: m(50) }, { code: code((p) => p.fundGroup === "NI LLC"), months: m(25) }];
    const g = feeGroups(rows);
    expect(g.map((x) => x.group)).toEqual(["JV III", "NI LLC", "Shopping Centers", "Residential"]);
    expect(g.find((x) => x.group === "Shopping Centers")!.total).toBe(1800);
    expect(g.reduce((s, x) => s + x.total, 0)).toBe(12 * 175);
  });
});
