import { describe, expect, it } from "vitest";
import {
  QUARTERLY_BILLINGS, computeQuarterly, emptyQuarterlyData, isAutoQuarter, quarterPosted, quarterSpikes, quarterlyEmail,
  type QuarterlyData,
} from "./quarterly";
import { buildQuarterlyPdf, quarterFigures } from "./quarterlyPdf";

const wawa = QUARTERLY_BILLINGS["9510-WAWA-Q"];

describe("Wawa quarterly CAM send", () => {
  it("emails Santiago in Drew's own wording", () => {
    const e = quarterlyEmail(wawa, "Q2", 2026, "Drew Winig");
    expect(wawa.sendTo).toBe("santiago.betancourt@wawa.com");
    expect(e.textBody).toBe([
      "Hi Santiago,", "",
      "I hope you are doing well. Attached is the second quarter’s CAM and TAX amounts for store #97 in Lafayette Hill, PA.", "",
      "Thank you,", "Drew Winig",
    ].join("\n"));
    expect(e.subject).toContain("Q2 2026");
    expect(e.subject).toContain("Wawa Store #97");
    expect(e.attachmentName).toBe("Wawa_Store_97_Q2_2026_CAM_and_Tax.pdf");
  });

  it("goes on its own from Q4 2026; earlier quarters are sent by hand", () => {
    expect(isAutoQuarter(wawa, 2026, "Q3")).toBe(false);
    expect(isAutoQuarter(wawa, 2026, "Q4")).toBe(true);
    expect(isAutoQuarter(wawa, 2027, "Q1")).toBe(true);
    expect(isAutoQuarter(wawa, 2025, "Q4")).toBe(false);
  });

  it("is ready once the quarter's LAST month is posted", () => {
    expect(quarterPosted("Q3", 8)).toBe(false);
    expect(quarterPosted("Q3", 9)).toBe(true);
    expect(quarterPosted("Q4", 12)).toBe(true);
  });

  it("holds a line that jumped against the same quarter last year", () => {
    const now: QuarterlyData = { ...emptyQuarterlyData(), camCosts: { "Parking Lot Maintenance/Repairs": { Q3: 21750 }, "Snow Removal": { Q1: 46431 } } };
    const last: QuarterlyData = { ...emptyQuarterlyData(), camCosts: { "Parking Lot Maintenance/Repairs": { Q3: 600 }, "Snow Removal": { Q1: 40000 } } };
    const s = quarterSpikes(wawa, now, "Q3", last, ["Q1", "Q2", "Q3"]);
    expect(s).toEqual([{ label: "Parking Lot Maintenance/Repairs", amount: 21750, typical: 600, basis: "last year" }]);
    // A heavy-snow Q1 against last year's Q1 is not a spike.
    expect(quarterSpikes(wawa, now, "Q1", last, ["Q1", "Q2", "Q3"])).toEqual([]);
  });

  it("with no prior year, judges against the other quarters — never a seasonal line", () => {
    const now: QuarterlyData = { ...emptyQuarterlyData(),
      camCosts: { "Parking Lot Maintenance/Repairs": { Q1: 300, Q2: 500, Q3: 21750 }, "Snow Removal": { Q1: 46431 } },
      retCosts: { Q2: 30000 } };
    expect(quarterSpikes(wawa, now, "Q3", null, ["Q1", "Q2", "Q3"]).map((x) => x.label)).toEqual(["Parking Lot Maintenance/Repairs"]);
    expect(quarterSpikes(wawa, now, "Q1", null, ["Q1", "Q2", "Q3"])).toEqual([]);
    expect(quarterSpikes(wawa, now, "Q2", null, ["Q1", "Q2", "Q3"])).toEqual([]);
  });

  it("bills the lease share of the quarter's costs and taxes, as the worksheet does", () => {
    const data: QuarterlyData = { ...emptyQuarterlyData(), camCosts: { "Trash Removal": { Q2: 10000 } }, retCosts: { Q2: 20000 } };
    const f = quarterFigures(wawa, data, computeQuarterly(wawa, data), "Q2");
    expect(f.camBalance).toBeCloseTo(2100);
    expect(f.retDue).toBeCloseTo(4200);
    expect(f.total).toBeCloseTo(6300);
    const pdf = buildQuarterlyPdf(wawa, data, computeQuarterly(wawa, data), "Q2", 2026);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
