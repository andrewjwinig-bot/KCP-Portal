import { describe, it, expect } from "vitest";
import { SEED_2026, raiseImpact as _ri, raisePlanImpact, poolDollars, employeeCost, allocatePayroll, allocTotal, seedPayrollBudget, sanitizePayrollDoc, monthly10, fundShares, employeesForBuilding } from "./payrollBudget";

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

describe("test a raise — runs through the same taxes and allocation, saves nothing", () => {
  it("a 5% raise for Harry lands 85 / 5 / 5 / 5 and sums to his gross change", () => {
    const raiseImpact = _ri;
    const r = raiseImpact(doc, { employeeId: "feldman-harry", kind: "pct", amount: 5 });
    expect(r.employee.after.salary).toBe(168_000);
    const dGross = r.employee.after.gross - r.employee.before.gross;
    // 8,000 salary + Medicare 1.45% + FICA 6.2% (under the base) + 401(k) at his %
    expect(dGross).toBeGreaterThan(8_000 * 1.0765);
    expect(Math.abs(r.totalAfter - r.totalBefore - dGross)).toBeLessThan(0.01);
    const sumDelta = r.rows.reduce((s: number, x: any) => s + x.delta, 0);
    expect(Math.abs(sumDelta - dGross)).toBeLessThan(0.01);
    // SC buildings carry 85%; 9510 has no 6010 (Alt PRS 0) so it never moves
    const sc = r.rows.filter((x: any) => x.group === "Shopping Centers").reduce((s: number, x: any) => s + x.delta, 0);
    expect(Math.abs(sc - dGross * 0.85)).toBeLessThan(0.01);
    expect(r.rows.find((x: any) => x.code === "9510")).toBeUndefined();
    expect(r.rows.find((x: any) => x.code === "0800")!.delta).toBeCloseTo(dGross * 0.10, 2);
  });
  it("a bonus is wages for FICA but not for the 401(k), and FICA stops at its base", () => {
    const raiseImpact = _ri;
    const alison = raiseImpact(doc, { employeeId: "korman-feldman-alison", kind: "bonus", amount: 10_000 });
    // $283K salary: past the FICA base AND the $200K Medicare cap, so a bonus adds no tax
    expect(alison.employee.after.gross - alison.employee.before.gross).toBeCloseTo(10_000, 2);
    expect(alison.employee.after.k401).toBe(alison.employee.before.k401);
    const marie = raiseImpact(doc, { employeeId: "jaster-marie", kind: "bonus", amount: 1_000 });
    expect(marie.employee.after.gross - marie.employee.before.gross).toBeCloseTo(1_076.5, 2);
  });
  it("does not touch the doc", () => {
    const raiseImpact = _ri;
    const before = JSON.stringify(doc);
    raiseImpact(doc, { employeeId: "winig-drew", kind: "dollar", amount: 5_000 });
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("the raise plan — several raises, a pool, and the recoverable part", () => {
  it("stacks raises and splits out Maintenance Salaries for the recoveries", () => {
    const r = raisePlanImpact(doc, [
      { employeeId: "gosik-jason", kind: "pct", amount: 3 },
      { employeeId: "winig-drew", kind: "dollar", amount: 5_000 },
    ]);
    expect(r.employees.map((e) => e.id).sort()).toEqual(["gosik-jason", "winig-drew"]);
    const gosik = r.employees.find((e) => e.id === "gosik-jason")!;
    expect(gosik.pay).toBeCloseTo(64_228 * 0.03, 2);
    const cost = r.employees.reduce((s, e) => s + e.cost, 0);
    expect(Math.abs(r.rows.reduce((s, x) => s + x.delta, 0) - cost)).toBeLessThan(0.01);
    // Only Gosik is maintenance, so the maintenance part of the rows is his cost.
    expect(Math.abs(r.rows.reduce((s, x) => s + x.deltaMaintenance, 0) - gosik.cost)).toBeLessThan(0.01);
  });
  it("the pool is a % of salaries, or a dollar figure", () => {
    const salaries = doc.employees.reduce((s, e) => s + e.salary, 0);
    expect(poolDollars(doc, { kind: "pct", amount: 3 })).toBeCloseTo(salaries * 0.03, 2);
    expect(poolDollars(doc, { kind: "dollar", amount: 40_000 })).toBe(40_000);
  });
  it("the plan is saved with the doc, never in its figures, and drops unknown employees", () => {
    const clean = sanitizePayrollDoc({ ...doc, raisePlan: { pool: { kind: "pct", amount: 4 }, raises: [
      { employeeId: "gosik-jason", kind: "bonus", amount: 1000 }, { employeeId: "nobody", kind: "pct", amount: 9 },
    ] } }, 2027)!;
    expect(clean.raisePlan).toEqual({ pool: { kind: "pct", amount: 4 }, raises: [{ employeeId: "gosik-jason", kind: "bonus", amount: 1000 }] });
    expect(allocatePayroll(clean).totals.gross).toBeCloseTo(allocatePayroll(doc).totals.gross, 2);
  });
});

describe("a building's employees add to its allocation row", () => {
  it("every fund building and misc entity ties", () => {
    const doc = seedPayrollBudget(2027);
    const a = allocatePayroll(doc);
    for (const f of a.funds) for (const b of f.rows) {
      const rows = employeesForBuilding(doc, b.code);
      const s = (k: "office" | "maintenance" | "marketing") => rows.reduce((t, r) => t + r[k], 0);
      expect(s("office")).toBeCloseTo(b.office, 2);
      expect(s("maintenance")).toBeCloseTo(b.maintenance, 2);
      expect(s("marketing")).toBeCloseTo(b.marketing, 2);
    }
    for (const m of a.misc) {
      const rows = employeesForBuilding(doc, m.code ?? m.key);
      expect(rows.reduce((t, r) => t + r.total, 0)).toBeCloseTo(m.annual, 2);
    }
  });
});
