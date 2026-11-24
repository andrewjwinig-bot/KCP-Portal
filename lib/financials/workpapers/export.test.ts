import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { computeWorkpapers } from "./compute";
import { workpapersXlsx } from "./export";

const m = (dec: number) => { const a = new Array(12).fill(0); a[11] = dec; return a; };
const wp = computeWorkpapers({
  key: "X", year: 2025, asOfMonth: 12,
  gl: {
    beginning: { "0110-0000": 1000, "0300-0000": 0, "3600-0000": -1000 },
    monthly: { "0110-0000": m(-250), "0300-0000": m(250) },
    names: { "0110-0000": "Cash-Operating", "0300-0000": "Suspense Account", "3600-0000": "Partners Capital" },
  },
  transactions: {
    "0110-0000": [{ month: 12, date: "2025-12-31", description: "check", ref: "1", amount: -250 }],
    "0300-0000": [{ month: 12, date: "2025-12-31", description: "YE Variance Entry", ref: "", amount: 250 }],
  },
});

describe("workpapersXlsx", () => {
  it("writes the summary, trial balance and one tab per section, with live totals", async () => {
    const buf = await workpapersXlsx(wp, { key: "X", name: "Test", entityName: "Test LP", ein: null });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const names = wb.worksheets.map((w) => w.name);
    expect(names.slice(0, 2)).toEqual(["Summary", "Trial Balance"]);
    expect(names).toContain("Suspense and Clearing");
    const susp = wb.getWorksheet("Suspense and Clearing")!;
    const formulas: string[] = [];
    susp.eachRow((row) => row.eachCell((c) => { if (c.formula) formulas.push(c.formula); }));
    expect(formulas.some((f) => f.startsWith("SUM("))).toBe(true);
    const text: string[] = [];
    susp.eachRow((row) => row.eachCell((c) => { if (typeof c.value === "string") text.push(c.value); }));
    expect(text.some((t) => t.includes("sitting in Suspense"))).toBe(true);
  });
});
