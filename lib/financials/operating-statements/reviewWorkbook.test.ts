import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { buildReviewChecklistXlsx } from "./reviewWorkbook";
import type { ReviewResult, ReviewProperty } from "./review";

const prop = (o: Partial<ReviewProperty> & { key: string; propertyCode: string }): ReviewProperty => ({
  propertyName: "Shops at Lafayette Hill", hasData: true,
  latestPeriod: 7, latestMonthLabel: "July", monthsCovered: 7,
  lines: [], flaggedMonthCount: 0, issues: [], tieOut: null, coverage: null, ...o,
});

const data: ReviewResult = {
  year: 2026,
  generatedAt: "2026-08-04T14:00:00.000Z",
  properties: [
    prop({
      key: "9510", propertyCode: "9510",
      issues: [{
        type: "not-posted", lineKey: "REIMBURSABLE EXPENSES::Snow Removal",
        section: "REIMBURSABLE EXPENSES", line: "Snow Removal",
        period: 7, monthLabel: "July", expected: 46_400,
      }],
      lines: [{
        lineKey: "REIMBURSABLE EXPENSES::Parking Lot Maintenance",
        section: "REIMBURSABLE EXPENSES", line: "Parking Lot Maintenance",
        months: [{
          period: 7, monthLabel: "July", flags: ["amount differs sharply from recent months"],
          actual: 28_350, budget: 592, variance: -27_758,
          note: "$21,750 to ABC Paving on 7/14 for lot resurfacing — capital, not maintenance.",
        }],
      }],
      flaggedMonthCount: 1,
    }),
    prop({ key: "2300", propertyCode: "2300", propertyName: "Brookwood" }), // nothing open
  ],
  totals: { flaggedMonthCount: 1, issueCount: 1, propertiesWithIssues: 1, tieOutIssues: 0, coverageGaps: 0 },
};

const val = (ws: ExcelJS.Worksheet, addr: string) => ws.getCell(addr).value;

describe("the month's checklist", () => {
  let ws: ExcelJS.Worksheet;
  // Letterhead (3) + meta (1) + header band = row 5; the property band is 6.
  const HEAD = 5, BAND = 6, FIRST = 7;

  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildReviewChecklistXlsx(data) as unknown as ArrayBuffer);
    ws = wb.worksheets[0];
  });

  it("says how much there is to do before you open it", () => {
    expect(String(val(ws, "A3"))).toContain("items to resolve");
    expect(String(val(ws, "A4"))).toContain("2 items");
    expect(String(val(ws, "A4"))).toContain("1 missing");
  });

  it("leads with the MISSING posting, not the biggest variance", () => {
    // A budgeted line reading $0 is an error of omission — the statement isn't
    // finished. A line that posted something odd at least posted something.
    // The old export dropped these entirely.
    expect(val(ws, `B${FIRST}`)).toBe("MISSING");
    expect(val(ws, `E${FIRST}`)).toBe("Snow Removal");
    expect(val(ws, `B${FIRST + 1}`)).toBe("REVIEW");
    expect(val(ws, `E${FIRST + 1}`)).toBe("Parking Lot Maintenance");
  });

  it("carries the auto-explain note as the thing to check", () => {
    expect(String(val(ws, `F${FIRST + 1}`))).toContain("ABC Paving");
    expect(String(val(ws, `F${FIRST + 1}`))).toContain("capital");
  });

  it("falls back to the flag reason rather than leaving the cell blank", async () => {
    // A row with no question on it is a line item, not a checklist entry.
    const noNote = structuredClone(data);
    noNote.properties[0].lines[0].months[0].note = null;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildReviewChecklistXlsx(noNote) as unknown as ArrayBuffer);
    expect(String(val(wb.worksheets[0], `F${FIRST + 1}`))).toContain("differs sharply");
  });

  it("gives every row a box to tick", () => {
    expect(val(ws, `A${FIRST}`)).toBeNull();
    expect(ws.getCell(`A${FIRST}`).border?.left?.style).toBe("thin");
    expect(ws.getCell(`A${FIRST}`).border?.bottom?.style).toBe("thin");
  });

  it("groups by property and skips a property with nothing open", () => {
    expect(String(val(ws, `A${BAND}`))).toContain("9510");
    expect(String(val(ws, `A${BAND}`))).toContain("2 items");
    // Brookwood has no items, so it never appears.
    const all = JSON.stringify(ws.getRows(1, 40)?.map((r) => r.values) ?? []);
    expect(all).not.toContain("Brookwood");
  });

  it("prints: landscape, header band repeated, frozen above the rows", () => {
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.printTitlesRow).toBe(`${HEAD}:${HEAD}`);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: HEAD });
  });

  it("says plainly when there is nothing to resolve", async () => {
    const clean: ReviewResult = {
      ...data,
      properties: [prop({ key: "2300", propertyCode: "2300" })],
      totals: { flaggedMonthCount: 0, issueCount: 0, propertiesWithIssues: 0, tieOutIssues: 0, coverageGaps: 0 },
    };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildReviewChecklistXlsx(clean) as unknown as ArrayBuffer);
    expect(String(val(wb.worksheets[0], "A6"))).toContain("Nothing to resolve");
  });
});
