import { describe, it, expect } from "vitest";
import { SEED_2026, employeeCost, allocatePayroll, allocTotal, seedPayrollBudget, sanitizePayrollDoc, monthly10, fundShares } from "./payrollBudget";

const doc = { ...SEED_2026, year: 2026 };
const cost = (id: string) => employeeCost(doc.employees.find((e) => e.id === id)!, doc.rates);

describe("sheet 1 — pay, taxes and benefits reproduce the 2026 workbook", () => {
  it("Drew: 165,000 salary → 190,127 gross", () => {
    const c = cost("winig-drew");
    expect(Math.round(c.perPay)).toBe(6_346);
    expect(Math.round(c.fica)).toBe(10_230);
    expect(Math.round(c.medi)).toBe(2_393);
    expect(c.futa).toBe(420);
    expect(Math.round(c.medical)).toBe(5_290);   // fringe 217.66 + 422.71 × 12
    expect(Math.round(c.k401)).toBe(5_775);
    expect(Math.round(c.gross)).toBe(190_127);
  });
  it("FICA stops at the wage base and Medicare at $200,000, as the workbook caps them", () => {
    const c = cost("korman-feldman-alison");
    expect(Math.round(c.fica)).toBe(11_439);
    expect(Math.round(c.medi)).toBe(2_900);
    expect(Math.round(c.gross)).toBe(319_342);
  });
  it("Randolph Lee: no FUTA, no benefits", () => {
    expect(Math.round(cost("lee-randolph").gross)).toBe(130_199);
  });
  it("every employee ties, and the total is $1,402,351", () => {
    const want: Record<string, number> = {
      "borton-rita": 10_667, "campbell-holley-lavalle": 17_024, "collier-donna": 8_876, "tomlinson-tami": 55_769,
      // The workbook charges Susan a flat $420 of FUTA; FUTA is on the first
      // $7,000 of WAGES and she earns $5,441, so it is $326 — $93 less.
      "weissman-susan": 6_724, "feldman-harry": 184_649, "jaster-marie": 46_027, "rovkin-tatyana": 74_260,
      "loiseau-charles": 75_126, "fox-nancy": 83_991, "masciantonio-gregory": 123_688, "gosik-jason": 75_788,
    };
    for (const [id, g] of Object.entries(want)) expect(Math.abs(cost(id).gross - g)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(allocatePayroll(doc).totals.gross - (1_402_351 - 93))).toBeLessThanOrEqual(2);
  });
});

describe("sheets 3 + 4 — allocation, down to the building", () => {
  const a = allocatePayroll(doc);
  it("every employee allocates 100%", () => {
    for (const e of doc.employees) expect(allocTotal(e)).toBe(100);
  });
  it("everything allocated equals gross payroll — nothing lost, nothing counted twice", () => {
    expect(Math.abs(a.allocated - a.totals.gross)).toBeLessThan(0.01);
  });
  it("SC maintenance salaries are the maintenance staff's SC share: the workbook's $118,748", () => {
    expect(Math.abs(a.byEntity.sc.maintenance - 118_748)).toBeLessThanOrEqual(2);
  });
  it("9510 carries no 6010 or marketing at the shopping centres; 40C0 no 6030 at NI LLC", () => {
    const sc = a.funds.find((f) => f.fund === "sc")!.rows.find((r) => r.code === "9510")!;
    expect(sc.office).toBe(0);
    expect(sc.marketing).toBe(0);
    expect(sc.maintenance).toBeGreaterThan(0);
    const ni = a.funds.find((f) => f.fund === "niLlc")!.rows.find((r) => r.code === "40C0")!;
    expect(ni.maintenance).toBe(0);
    expect(ni.office).toBeGreaterThan(0);
  });
  it("PRS is square footage; Alt PRS the keyed split", () => {
    expect(fundShares(doc.funds.sc, "prs")["1100"]).toBeCloseTo(8_287 / 296_787, 6);
    expect(fundShares(doc.funds.jv3, "alt")["3610"]).toBeCloseTo(0.30, 6);
  });
  it("marketing: Alison's 23% split SC 46 / NI LLC 34 / JV III 20", () => {
    expect(a.marketing.byFund.sc / a.marketing.total).toBeCloseTo(0.46, 6);
  });
  it("Office Works' indirect is Drew's 5% + Nancy's 10% — the workbook's $17,905", () => {
    const ow = a.misc.find((m) => m.key === "4900")!;
    expect(Math.abs(ow.parts.find((p) => p.label === "Indirect")!.annual - 17_905)).toBeLessThanOrEqual(2);
  });
  it("monthly rounds to $10, as the workbook does", () => {
    expect(monthly10(10_824)).toBe(900);
  });
});

describe("a new year and a saved doc", () => {
  it("2027 starts from 2026 as it stood", () => {
    const d = seedPayrollBudget(2027);
    expect(d.year).toBe(2027);
    expect(d.employees).toHaveLength(15);
    expect(d.seededFrom).toMatch(/2026/);
  });
  it("sanitizes what the page posts", () => {
    const d = sanitizePayrollDoc({ employees: [{ id: "x", name: "A", salary: "1000", alloc: { sc: "100", bogus: 5 } }, { id: "x", name: "B" }] }, 2027)!;
    expect(d.employees[0].salary).toBe(1000);
    expect(d.employees[0].alloc).toEqual({ sc: 100 });
    expect(new Set(d.employees.map((e) => e.id)).size).toBe(2);
    expect(d.funds.sc.buildings).toHaveLength(10);
  });
});
