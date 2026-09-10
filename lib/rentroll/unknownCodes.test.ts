import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseRentRollExcel } from "./parseRentRollExcel";

// Column layout the parser reads: occupant = col B (1), unit ref = col I (8),
// sqft = col M (12).
function row(occupant: string, unitRef: string, sqft: number): any[] {
  const r = new Array(16).fill("");
  r[1] = occupant; r[8] = unitRef; r[12] = sqft;
  return r;
}
function workbook(rows: any[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseRentRollExcel — unknown property codes", () => {
  it("keeps known-code units and captures unknown-code rows instead of dropping them", () => {
    const buf = workbook([
      row("Acme Corp", "1100-100", 1000),   // 1100 is a known property
      row("Ghost LLC", "ZZZZ-9", 500),      // ZZZZ is not a known property code
      row("Phantom Inc", "ZZZZ-10", 250),
    ]);
    const parsed = parseRentRollExcel(buf);

    // Known unit landed on its property.
    const p1100 = parsed.properties.find((p) => p.propertyCode === "1100");
    expect(p1100?.units).toHaveLength(1);

    // Unknown-code rows are captured, not silently dropped.
    expect(parsed.unknownUnits).toBeDefined();
    expect(parsed.unknownUnits!.map((u) => u.unitRef).sort()).toEqual(["ZZZZ-10", "ZZZZ-9"]);
    const ghost = parsed.unknownUnits!.find((u) => u.unitRef === "ZZZZ-9")!;
    expect(ghost.code).toBe("ZZZZ");
    expect(ghost.occupantName).toBe("Ghost LLC");
    expect(ghost.sqft).toBe(500);
    // And none of them leaked into a real property.
    expect(parsed.properties.some((p) => p.propertyCode === "ZZZZ")).toBe(false);
  });
});
