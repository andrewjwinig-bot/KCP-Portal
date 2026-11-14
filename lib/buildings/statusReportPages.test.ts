import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { drawFloorPlanPages } from "./statusReportPages";
import { buildingPlanFor } from "./plans";

// The status report draws a page per mapped floor from the PNG copy (pdf-lib
// cannot read the WebP the card draws) — a missing or unreadable image would
// silently drop the page, so pin that every floor of every building draws.
describe("status report floor-plan pages", () => {
  for (const code of ["3610", "3620", "3640", "4050", "4060", "4070", "4080"]) {
    it(`${code}: one page per floor`, async () => {
      const bp = buildingPlanFor(code)!;
      const pdf = await PDFDocument.create();
      const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
      const units = bp.floors.flatMap((f) => f.suites.map((s, i) => ({
        unitRef: s.unit, occupantName: i % 2 ? "Tenant" : "", isVacant: !(i % 2), sqft: 1000, leaseTo: "2028-06-30",
      })));
      const n = await drawFloorPlanPages(pdf, fonts, { propertyCode: code, units }, { name: code, reportTitle: "Test", asOf: new Date("2026-11-30") });
      expect(n).toBe(bp.floors.length);
    });
  }
});
