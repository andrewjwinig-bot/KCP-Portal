import { describe, expect, it } from "vitest";
import { getOwnersForProperty } from "../properties/ownership";
import { computeWithholding, startingDoc, sanitizeDoc, SEED_YEAR, WITHHOLDING_SEEDS } from "./paNrWithholding";

describe("PA NR withholding", () => {
  it("reproduces the Elbridge workbook to the cent", () => {
    const owners = getOwnersForProperty("7200");
    const r = computeWithholding(owners, startingDoc("7200", SEED_YEAR));
    expect(r.rows).toHaveLength(24);
    expect(r.totals.paid).toBe(2560);
    expect(r.totals.estimate).toBe(2560);
    expect(r.totals.withholding).toBe(5120);
    expect(r.totals.gross).toBeCloseTo(150000, 1);
    expect(r.totals.net).toBeCloseTo(144880, 1);
    const sohn = r.rows.find((x) => x.id === "k1-7200-sohn")!;
    expect(sohn.nrPct).toBeCloseTo(0.496484375, 9);
    expect(sohn.net).toBeCloseTo(45512.8, 2);
    expect(r.orphaned).toEqual([]);
  });

  it("Revere: the workbook's withholding, without the redeemed partner", () => {
    const owners = getOwnersForProperty("7300");
    const r = computeWithholding(owners, startingDoc("7300", SEED_YEAR));
    expect(r.rows.some((x) => x.id.includes("bisard"))).toBe(false);
    expect(r.totals.withholding).toBeCloseTo(3423.15, 2);
    expect(r.rows.find((x) => x.id === "k1-7300-aisard")!.withholding).toBeCloseTo(568.85, 2);
    expect(r.totals.gross).toBeCloseTo(300000, 0);
  });

  it("every seeded id is on its roster", () => {
    for (const [code, seed] of Object.entries(WITHHOLDING_SEEDS)) {
      const ids = new Set(getOwnersForProperty(code).map((o) => o.id));
      for (const id of Object.keys(seed.partners)) expect(ids.has(id), `${code} ${id}`).toBe(true);
    }
  });

  it("another year starts with no payments", () => {
    expect(startingDoc("7200", SEED_YEAR + 1).partners).toEqual({});
  });

  it("sanitize drops unknown owners and negatives", () => {
    const owners = getOwnersForProperty("7300");
    const d = sanitizeDoc({ distribution: "1000", partners: { x: { paid: 5 }, "k1-7300-aisard": { paid: -3, estimate: 2.345 } } }, owners);
    expect(d).toEqual({ distribution: 1000, partners: { "k1-7300-aisard": { paid: 0, estimate: 2.35 } } });
  });
});

describe("PA NR withholding workbook", () => {
  it("writes live formulas that tie", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { buildWithholdingXlsx } = await import("./paNrWithholdingExport");
    const result = computeWithholding(getOwnersForProperty("7200"), startingDoc("7200", SEED_YEAR));
    const buf = await buildWithholdingXlsx({ entity: "Elbridge Partnership", year: 2026, result });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("PA NR Withholding")!;
    const cells: any[] = [];
    ws.eachRow((row) => row.eachCell((c) => cells.push(c.value)));
    const formulas = cells.filter((v) => v && typeof v === "object" && "formula" in v).map((v) => v.formula);
    expect(formulas.some((f: string) => /^SUM\(J/.test(f))).toBe(true);
    expect(formulas.some((f: string) => /\*\$C\$/.test(f))).toBe(true);
    expect(formulas.filter((f: string) => /^H\d+-I\d+$/.test(f))).toHaveLength(24);
  });
});
