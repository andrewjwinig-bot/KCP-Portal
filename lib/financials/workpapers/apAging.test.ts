import { describe, it, expect } from "vitest";
import { parseApAging, apAgingFromPdfPages, placeApSections, invoicesNotInBooks, type Row, type PdfItem } from "./apAging";
import { computeWorkpapers } from "./compute";

// Synthetic files in Skyline's AP Aged Trial Balance layouts (no real vendors).
// Excel: only the first property's name prints; every section closes with
// "Company Total".
const xRow = (cells: Record<number, unknown>): Row => { const r: Row = new Array(35).fill(null); for (const [k, v] of Object.entries(cells)) r[+k] = v as Row[number]; return r; };
const xls: Row[] = [
  xRow({ 0: "11/17/2026", 16: "Korman Commercial Properties, Inc" }),
  xRow({ 20: "AP Aged Trial Balance" }),
  xRow({ 13: "0800 - Bellmawr Joint Venture" }),
  xRow({ 23: "Balance as of 12/31/2025" }),
  xRow({ 2: "Vendor Information", 15: "Invoice\nDate" }),
  xRow({ 2: "Voucher", 8: "Invoice#", 18: "Current", 22: "31 - 60 Days", 25: "61 - 90 Days", 29: "Over 90 Days", 33: "Invoice Description" }),
  xRow({ 1: "TOWN1", 9: "-", 10: "Township Of Somewhere" }),
  xRow({ 2: "00951 ", 8: "B1 L1 ", 15: "08/26/25", 29: "  1,000.00 ", 33: "tax" }),
  xRow({ 3: "Total  ", 9: " 1,000.00 " }),
  xRow({ 2: "Company Total  ", 12: "  1,000.00 " }),
  xRow({ 1: "GASC1", 9: "-", 10: "City Gas Co" }),
  xRow({ 2: "04307 ", 8: "A-1", 15: "12/07/25", 18: "  500.00 " }),
  xRow({ 2: "04572 ", 8: "A-2", 15: "12/06/25", 18: "  150.17 " }),
  xRow({ 2: "Company Total  ", 12: "  650.17 " }),
  xRow({ 1: "WIDG1", 9: "-", 10: "Widget Repairs Inc" }),
  xRow({ 2: "00010 ", 8: "W1", 15: "11/02/25", 22: "  75.00 " }),
  xRow({ 2: "Company Total  ", 12: "  75.00 " }),
  xRow({ 2: "Portfolio Total  ", 12: "  1,725.17 " }),
];

describe("parseApAging (Excel)", () => {
  const f = parseApAging(xls);
  it("reads the as-of date, the first header and every section", () => {
    expect(f.asOf).toBe("2025-12-31");
    expect(f.headerCode).toBe("0800");
    expect(f.sections.map((s) => s.total)).toEqual([1000, 650.17, 75]);
    expect(f.portfolioTotal).toBe(1725.17);
  });
  it("reads each invoice with its bucket and date", () => {
    expect(f.sections[0].invoices[0]).toMatchObject({ vendor: "Township Of Somewhere", voucher: "00951", amount: 1000, bucket: "90+", date: "2025-08-26" });
    expect(f.sections[2].invoices[0].bucket).toBe("31-60");
  });
  it("places sections by header, exact payables total, then vendors", () => {
    const p = placeApSections(f, [
      { key: "0800", owed: 1000 },
      { key: "4500", owed: 500, vendors: ["City Gas Co", "Liberty Bank"] },   // off by the late bill
      { key: "9510", owed: 75 },
      { key: "2300", owed: 9000, vendors: ["Liberty Bank"] },
    ]);
    expect(p.map((x) => [x.key, x.by])).toEqual([["0800", "total"], ["4500", "vendors"], ["9510", "total"]]);
  });
  it("leaves a section it cannot tell unplaced", () => {
    const p = placeApSections({ ...f, headerCode: null }, [{ key: "A", owed: 1 }, { key: "B", owed: 2 }]);
    expect(p.every((x) => x.key === null)).toBe(true);
  });
});

// PDF: every page names its property under the title.
const it_ = (x: number, y: number, s: string): PdfItem => ({ x, y, s });
const page = (code: string, name: string, body: PdfItem[]): PdfItem[] => [
  it_(242, 739, "AP Aged Trial Balance"), it_(249, 722, `${code} - ${name}`), it_(335, 701, "Balance as of 12/31/2025"),
  it_(30, 674, "Voucher"), it_(80, 674, "Invoice#"), it_(187, 674, "Current"), it_(257, 675, "31 - 60 Days"),
  it_(336, 675, "61 - 90 Days"), it_(413, 675, "Over 90 Days"), it_(498, 675, "Invoice Description"),
  ...body,
];
const pdf = [
  page("0800", "Bellmawr Joint Venture", [
    it_(22, 661, "TOWN1"), it_(74, 659.4, "-"), it_(78, 661, "Township Of Somewhere"),
    it_(28, 649, "00951"), it_(72, 649, "B1 L1"), it_(126, 649, "08/26/25"), it_(448, 649, "1,000.00"), it_(482, 649, "00003762"),
    it_(36, 596.5, "Total"), it_(128, 597, "1,000.00"),
    it_(445, 577.4, "1,000.00"), it_(131, 574.8, "1,000.00"), it_(23, 574, "Company Total"),
  ]),
  page("3610A", "Neshaminy III Condominium", [
    it_(22, 661, "MGMT1"), it_(74, 659.4, "-"), it_(78, 661, "Property Manager"),
    it_(28, 649, "00187"), it_(126, 649, "12/31/25"), it_(224, 649, "915.66"), it_(482, 649, "Management Fees"),
    it_(224, 577.4, "915.66"), it_(131, 574.8, "915.66"), it_(23, 574, "Company Total"),
    it_(131, 540, "1,915.66"), it_(23, 539, "Portfolio Total"),
  ]),
];

describe("apAgingFromPdfPages", () => {
  const f = apAgingFromPdfPages(pdf);
  it("names every section from its page header", () => {
    expect(f.sections.map((s) => [s.code, s.total])).toEqual([["0800", 1000], ["3610A", 915.66]]);
    expect(f.portfolioTotal).toBe(1915.66);
    expect(f.asOf).toBe("2025-12-31");
  });
  it("buckets by column", () => {
    expect(f.sections[0].invoices[0].bucket).toBe("90+");
    expect(f.sections[1].invoices[0]).toMatchObject({ bucket: "current", amount: 915.66, vendor: "Property Manager" });
  });
  it("a named section is placed by its header", () => {
    expect(placeApSections(f, []).map((p) => [p.key, p.by])).toEqual([["0800", "header"], ["3610A", "header"]]);
  });
});

describe("the workpaper's AP tie-out", () => {
  const m = (dec: number) => { const a = new Array(12).fill(0); a[11] = dec; return a; };
  const base = {
    key: "4500", year: 2025, asOfMonth: 12,
    gl: { beginning: { "2110-0000": 0, "0110-0000": 500 }, monthly: { "2110-0000": m(-500), "0110-0000": m(500) } },
    transactions: { "2110-0000": [{ month: 12, date: "2025-12-07", description: "City Gas Co", ref: "", amount: -500 }], "0110-0000": [{ month: 12, date: "2025-12-31", description: "x", ref: "", amount: 500 }] },
  };
  it("a gap that is exactly the bills entered after the quarter is timing, not an error", () => {
    const invoices = parseApAging(xls).sections[1].invoices;
    const late = invoicesNotInBooks(invoices, [{ amount: -500, text: "City Gas Co" }]);
    expect(late.map((i) => i.amount)).toEqual([150.17]);
    const wp = computeWorkpapers({ ...base, sources: { apAging: { asOf: "2025-12-31", total: 650.17, invoices: 2, notInBooks: late } } });
    const ap = wp.schedules.find((s) => s.code === "2110-0000")!;
    expect(ap.support?.ties).toBe(false);
    expect(ap.flags[0]).toMatchObject({ level: "info" });
    expect(ap.status).toBe("ok");
  });
  it("a same-amount bill posted in an EARLIER month is not the late one", () => {
    const inv = [{ vendor: "City Gas Co", vendorCode: "GASC1", description: "", voucher: "1", invoice: "A-2", date: "2025-12-06", amount: 150.17, bucket: "current" as const }];
    expect(invoicesNotInBooks(inv, [{ amount: -150.17, text: "City Gas Co", month: 11 }]).length).toBe(1);
    expect(invoicesNotInBooks(inv, [{ amount: -150.17, text: "City Gas Co", month: 12 }]).length).toBe(0);
  });
  it("the gap made up of SOME of the unmatched bills is still timing", () => {
    const notInBooks = [{ vendor: "City Gas Co", date: "2025-12-06", amount: 150.17 }, { vendor: "Widget Repairs Inc", date: "2025-11-02", amount: 75 }];
    const wp = computeWorkpapers({ ...base, sources: { apAging: { asOf: "2025-12-31", total: 650.17, invoices: 2, notInBooks } } });
    const ap = wp.schedules.find((s) => s.code === "2110-0000")!;
    expect(ap.status).toBe("ok");
    expect(ap.flags[0].text).toContain("City Gas Co");
    expect(ap.flags[0].text).not.toContain("Widget");
  });
  it("an unexplained gap is for review", () => {
    const wp = computeWorkpapers({ ...base, sources: { apAging: { asOf: "2025-12-31", total: 900, invoices: 2, notInBooks: [] } } });
    expect(wp.schedules.find((s) => s.code === "2110-0000")!.status).toBe("review");
  });
  it("ties when the aging equals the books", () => {
    const wp = computeWorkpapers({ ...base, sources: { apAging: { asOf: "2025-12-31", total: 500, invoices: 1, notInBooks: [] } } });
    expect(wp.schedules.find((s) => s.code === "2110-0000")!.support?.ties).toBe(true);
  });
});
