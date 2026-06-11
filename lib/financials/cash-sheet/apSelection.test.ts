import { describe, it, expect } from "vitest";
import { parseApSelection } from "./apSelection";

// A trimmed AP AutoPay Selections Report: the header date + a couple of
// "Property/Company <CODE> Total" lines (Invoice | Payment | Discount | Net).
function rows(date: string, totals: [string, number][]): (string | number | null)[][] {
  const out: (string | number | null)[][] = [[date, "", "Korman Commercial Properties,"]];
  for (const [code, amt] of totals) {
    const m = amt.toFixed(2);
    out.push([`Property/Company ${code} Total`, "", "1 Check(s)", "", m, "", m, "", "0.00", "", m]);
  }
  return out;
}

describe("parseApSelection", () => {
  it("reads the report date and per-property payment totals", () => {
    const r = parseApSelection(rows("6/11/2026", [["0800", 4042], ["1100", 70]]));
    expect(r.reportDate).toBe("2026-06-11");
    expect(r.byCode).toEqual({ "0800": 4042, "1100": 70 });
  });

  it("maps fund / clearing codes to their Cash-Sheet codes", () => {
    const r = parseApSelection(rows("6/11/2026", [
      ["FJVIII", 7801.8], ["FNIPLX", 33250.26], ["FIIICO", 6722.09], ["2000", 36532.49],
    ]));
    expect(r.byCode).toEqual({ PJV3: 7801.8, PNIPLX: 33250.26, CONDO: 6722.09, "2010": 36532.49 });
  });

  it("ignores non-AP sheets (no Property/Company totals)", () => {
    expect(parseApSelection([["Some GL", "", "stuff"], ["1100", "", "12,345.67"]]).byCode).toEqual({});
  });
});
