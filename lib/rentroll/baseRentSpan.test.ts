import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseRentRollExcel } from "./parseRentRollExcel";

// A value FLOATS inside its merged header block, so a single column index
// cannot find it. The report declares "UNIT INFO / BASE RENT" at column 18;
// the figure lands at 20 for a tenant WITH lease dates and at 18 for one
// WITHOUT, because the dates in the preceding block push it right.
//
// Against the real August 2026 roll, the old fixed index read the wrong
// column on 14 of 46 properties — three of them reporting ZERO base rent for
// the whole building.
function sheetRows(): unknown[][] {
  const at = (pairs: Record<number, unknown>): unknown[] => {
    const row: unknown[] = new Array(60).fill("");
    for (const [c, v] of Object.entries(pairs)) row[Number(c)] = v;
    return row;
  };
  return [
    at({ 19: "Korman Commercial Properties, Inc" }),
    at({ 19: "REPORT DATE FROM 8/1/2026 TO 8/31/2026" }),
    at({ 1: "PROPERTY:", 6: "Parkwood Professional Building" }),
    at({
      1: "OCCUPANT \nNAME", 8: "UNIT\nREFERENCE \nNUMBER", 12: "SQUARE\nFEET",
      15: "LEASE TERM\n\nFROM             TO", 18: "UNIT INFO\nBASE RENT",
      22: "PRORATED\nBASE RENT \nANNUAL",
    }),
    // WITH lease dates — every figure sits two columns right of its header.
    // Cell-for-cell as Skyline exported Shear Sensation at 1100.
    at({ 1: "Shear Sensation", 8: "1100-34-CU", 12: "1,934", 15: "5/1/1994", 17: "3/31/2026",
         20: "1,732.55", 24: "20,790.60", 28: "10.75", 31: "05/01/2026", 35: "1,732.55",
         39: "1,117.00", 44: "6.93", 48: "325.00", 52: "2.02", 53: "473.00", 55: "2.93",
         57: "3,647.55", 59: "22.63" }),
    // WITHOUT lease dates — the SAME fields land further left, and the row's
    // GROSS ends up at 53, which is the column the parser used to read as
    // Other. Cell-for-cell as Skyline exported Ferry Good Treats.
    at({ 1: "Ferry Good Treats", 8: "1100-12330-CU", 12: "1,228",
         18: "2,000.00", 22: "24,000.00", 27: "19.54", 29: "12/01/2025", 32: "2,000.00",
         37: "0.00", 39: "0.00", 44: "0.00", 48: "0.00", 51: "159.00", 52: "1.55",
         53: "2,159.00", 56: "21.10" }),
  ];
}

const parse = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows() as never), "RR");
  return parseRentRollExcel(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
};

describe("base rent is found in its header's span, not at one column", () => {
  const units = parse().properties.flatMap((p) => p.units);
  const of = (ref: string) => units.find((u) => u.unitRef.startsWith(ref))!;

  it("reads a tenant WITH lease dates, whose figure sits at column 20", () => {
    expect(of("1100-34").baseRent).toBeCloseTo(1732.55, 2);
  });

  it("reads a tenant WITHOUT lease dates, whose figure sits at column 18", () => {
    // The bug: $2,000 of real rent read as $0, so 1100 totalled $3,054.38
    // against Skyline's $5,054.38 and the correctly-billed charge was then
    // reported on the operating statement as "UNEXPECTED $2,000".
    expect(of("1100-12330").baseRent).toBeCloseTo(2000, 2);
  });

  it("the property total ties to the roll", () => {
    const total = units.reduce((s, u) => s + u.baseRent, 0);
    expect(total).toBeCloseTo(3732.55, 2);
  });

  it("OTHER is the other-expense column, not the gross rent", () => {
    // Column 53 is where GROSS RENTS begins, and the old fixed index read it
    // as Other — so Ferry Good showed $2,159 of "other expense" that was its
    // entire gross rent. 42 of 441 rows in the August roll did this.
    expect(of("1100-12330").otherMonth).toBeCloseTo(159, 2);
    expect(of("1100-34").otherMonth).toBeCloseTo(473, 2);
  });

  it("CAM and RET survive the same treatment", () => {
    expect(of("1100-34").opexMonth).toBeCloseTo(1117, 2);
    expect(of("1100-34").reTaxMonth).toBeCloseTo(325, 2);
    expect(of("1100-12330").opexMonth).toBe(0);
    expect(of("1100-12330").reTaxMonth).toBe(0);
  });
});
