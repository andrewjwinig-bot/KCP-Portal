import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildAllocExportXlsx, type AllocExportRow } from "./export";

function row(propertyId: string, propertyName: string, accountCode: string, accountName: string, allocPct: number, gross: number): AllocExportRow {
  return {
    propertyId, propertyName, accountCode, accountName,
    accountSuffix: accountCode.split("-")[1] as any,
    grossAmount: gross,
    allocPct,
    allocAmount: Math.round(gross * allocPct * 100) / 100,
  };
}

async function build() {
  const rows = [
    row("3610", "Bldg 1", "7110-9301", "Marketing", 0.5, 1000),
    row("3610", "Bldg 1", "8940-9301", "Telephone", 0.5, 200),
    row("4050", "Bldg 5", "7110-9301", "Marketing", 0.3, 1000),
  ];
  const blob = buildAllocExportXlsx({
    periodText: "1/1/2026 To 6/30/2026",
    rows,
    propertyOrder: [{ id: "3610", name: "Bldg 1" }, { id: "4050", name: "Bldg 5" }],
    accountCodes: ["7110-9301", "8940-9301"],
  });
  const buf = Buffer.from(await blob.arrayBuffer());
  return { wb: XLSX.read(buf, { type: "buffer", cellNF: true, cellStyles: true }), buf };
}

describe("Allocations tab", () => {
  it("Allocated Amount is a Gross × % formula, % stored as a fraction", async () => {
    const ws = (await build()).wb.Sheets["Allocations"];
    expect(ws["G2"].v).toBeCloseTo(0.5, 6);      // % as fraction
    expect(ws["G2"].z).toBe("0.00%");            // percent format
    expect(ws["H2"].f).toBe("F2*G2");            // Allocated = Gross × %
    expect(ws["H2"].v).toBeCloseTo(500, 2);
    expect(ws["F2"].z).toBe('"$"#,##0;("$"#,##0)');
    expect(ws["H2"].z).toBe('"$"#,##0;("$"#,##0)');
  });
});

describe("Summary tab", () => {
  it("has a name header row above the code row, TOTAL labels", async () => {
    const ws = (await build()).wb.Sheets["Summary"];
    expect(ws["C1"].v).toBe("Marketing");
    expect(ws["C2"].v).toBe("7110-9301");
    expect(ws["E2"].v).toBe("TOTAL"); // TOTAL column header
    expect(ws["A5"].v).toBe("TOTAL"); // TOTAL (sum) row label
  });

  it("data cells trace back to Allocations via SUMIFS; totals are SUM", async () => {
    const ws = (await build()).wb.Sheets["Summary"];
    expect(ws["C3"].f).toBe("SUMIFS(Allocations!$H$2:$H$4,Allocations!$A$2:$A$4,$A3,Allocations!$D$2:$D$4,C$2)");
    expect(ws["C3"].v).toBeCloseTo(500, 2);
    expect(ws["E3"].f).toBe("SUM(C3:D3)");       // TOTAL column
    expect(ws["C5"].f).toBe("SUM(C3:C4)");       // TOTAL row
    expect(ws["E5"].f).toBe("SUM(E3:E4)");       // grand total
    expect(ws["E5"].v).toBeCloseTo(900, 2);      // 500+100+300
  });
});

describe("number formats", () => {
  it("registers the currency format at a valid custom id (>=164), not reserved", async () => {
    const { buf } = await build();
    const wb = XLSX.read(buf, { type: "buffer", cellStyles: true });
    // The styles part must define our money format at an id in the custom range.
    const sheetCells = wb.Sheets["Summary"];
    expect(sheetCells["E5"].z).toBe('"$"#,##0;("$"#,##0)');
  });

  it("contains no strikethrough font", async () => {
    const { buf } = await build();
    // styles.xml never declares a struck font.
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const styles = await zip.file("xl/styles.xml")!.async("string");
    expect(/strike/i.test(styles)).toBe(false);
    // And the money format is at id >= 164 (valid custom range).
    const m = styles.match(/numFmtId="(\d+)"\s+formatCode="&quot;\$&quot;#,##0/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(164);
  });
});
