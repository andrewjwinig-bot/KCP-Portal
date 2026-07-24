import { describe, it, expect } from "vitest";
import { parseApSelection, apTextToRows } from "./apSelection";

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

  it("maps fund codes to their Cash-Sheet codes (2000 Clearing keeps its own row)", () => {
    const r = parseApSelection(rows("6/11/2026", [
      ["FJVIII", 7801.8], ["FNIPLX", 33250.26], ["FIIICO", 6722.09], ["2000", 36532.49],
    ]));
    expect(r.byCode).toEqual({ PJV3: 7801.8, PNIPLX: 33250.26, CONDO: 6722.09, "2000": 36532.49 });
  });

  it("ignores non-AP sheets (no Property/Company totals)", () => {
    expect(parseApSelection([["Some GL", "", "stuff"], ["1100", "", "12,345.67"]]).byCode).toEqual({});
  });

  it("parses PDF-extracted text (shuffled columns) via apTextToRows", () => {
    // PDF text extraction reorders the money columns; the max value still wins.
    const text = [
      "6/3/2026",
      "1,681.36\tProperty/Company FJVIII Total 3 Check(s) 1,681.36\t0.00\t1,681.36",
      "2,501.50 Property/Company 9500 Total 1 Check(s) 2,501.50 0.00 2,501.50",
    ].join("\n");
    const r = parseApSelection(apTextToRows(text));
    expect(r.reportDate).toBe("2026-06-03");
    expect(r.byCode).toEqual({ PJV3: 1681.36, "9510": 2501.5 }); // 9500 → 9510
  });
});
