import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { computeBalanceSheet, type BsGl } from "./compute";
import { balanceSheetXlsx, balanceSheetPdf, asOfLabel } from "./export";

// The same double-entry ledger the compute tests use, in miniature: openings
// balance, and the year's single journal balances.
const gl: BsGl = {
  beginning: {
    "0110-0000": 400_000, "0410-0000": 30_000, "1410-0000": 3_000_000,
    "1510-0000": -1_700_000, "2110-0000": -40_000, "2720-8501": -4_300_000,
    "3200-0000": 2_610_000,
  },
  monthly: {
    "0110-0000": [58_000, ...new Array(11).fill(0)],
    "0410-0000": [1_000, ...new Array(11).fill(0)],
    "1510-0000": [-5_000, ...new Array(11).fill(0)],
    "2720-8501": [6_000, ...new Array(11).fill(0)],
    "4230-8501": [-75_000, ...new Array(11).fill(0)],
    "6120-0000": [10_000, ...new Array(11).fill(0)],
    "6810-0000": [5_000, ...new Array(11).fill(0)],
  },
  names: {
    "0110-0000": "Cash-Operating", "0410-0000": "Accounts Receivable - Tenants",
    "1410-0000": "Building", "1510-0000": "Accumulated Depreciation",
    "2110-0000": "Accounts Payable", "2720-8501": "Mortgage Payable",
    "3200-0000": "Partners Capital", "4230-8501": "Rental Income - Base Rent",
    "6120-0000": "Electric", "6810-0000": "Depreciation Expense",
  },
  maxPeriodInFile: 12, coverageEnd: 12, coverageStartMonth: 1,
};

const sheet = computeBalanceSheet(gl, { key: "2300", year: 2025, asOfMonth: 12 });
const meta = { entityName: "Brookwood Shopping Center JV", propertyName: "Brookwood Shopping Center", ein: "23-2399813" };

describe("balance sheet exports run", () => {
  it("the fixture balances, so the exports are exporting something real", () => {
    expect(sheet.proof.difference).toBe(0);
    expect(sheet.usable).toBe(true);
  });

  it("xlsx is a valid workbook", async () => {
    const buf = await balanceSheetXlsx(sheet, meta);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 2).toString("latin1")).toBe("PK");
  });

  it("every total in the workbook is a live formula, not a typed number", async () => {
    // The rule the whole export stack follows: a cell that aggregates others
    // references them, so editing a line flows through and the sheet still
    // ties in the recipient's hands.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await balanceSheetXlsx(sheet, meta) as any);
    const ws = wb.getWorksheet("Balance Sheet")!;
    const formulas: string[] = [];
    ws.eachRow((row) => {
      const c = row.getCell(3);
      if (c.value && typeof c.value === "object" && "formula" in (c.value as any)) formulas.push((c.value as any).formula);
    });
    // group totals + section totals + the L&E line + the proof
    expect(formulas.length).toBeGreaterThanOrEqual(6);
    expect(formulas.some((f) => /^SUM\(C\d+:C\d+\)$/.test(f))).toBe(true);   // a group total
    expect(formulas.some((f) => /^C\d+\+C\d+$/.test(f))).toBe(true);         // L&E
    expect(formulas.some((f) => /^C\d+-C\d+$/.test(f))).toBe(true);          // the proof
  });

  it("the proof row subtracts the two section totals it names", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await balanceSheetXlsx(sheet, meta) as any);
    const ws = wb.getWorksheet("Balance Sheet")!;
    let proof = "";
    const totals: Record<string, number> = {};
    ws.eachRow((row) => {
      const label = String(row.getCell(2).value ?? "");
      const v = row.getCell(3).value as any;
      if (/^TOTAL ASSETS$/i.test(label)) totals.assets = row.number;
      if (/^TOTAL LIABILITIES AND/i.test(label)) totals.le = row.number;
      if (v && typeof v === "object" && typeof v.formula === "string" && /^C\d+-C\d+$/.test(v.formula)) proof = v.formula;
    });
    expect(proof).toBe(`C${totals.assets}-C${totals.le}`);
  });

  it("asks Excel to recalculate on open, because a zero result is not stored", async () => {
    // ExcelJS drops a cached result of 0 when it writes a formula cell, and the
    // proof is the cell that should read zero — so without fullCalcOnLoad the
    // evidence the sheet balances would open blank. Pinned because it looks
    // like an incidental line and is not one.
    //
    // Read from the file's own XML rather than by loading it back: ExcelJS
    // WRITES calcPr but does not parse it again, so a round-trip through its
    // own reader would report the flag missing when it is really there.
    const zip = await JSZip.loadAsync(await balanceSheetXlsx(sheet, meta));
    const xml = await zip.file("xl/workbook.xml")!.async("string");
    expect(xml).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"/);
  });

  it("pdf is a valid PDF", async () => {
    const bytes = await balanceSheetPdf(sheet, meta);
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("labels the as-of date the way a statement heading reads", () => {
    expect(asOfLabel(sheet)).toBe("December 31, 2025");
    expect(asOfLabel({ ...sheet, asOfMonth: 6 })).toBe("June 30, 2025");
    expect(asOfLabel({ ...sheet, asOfMonth: 2, year: 2024 })).toBe("February 29, 2024"); // leap year
  });
});
