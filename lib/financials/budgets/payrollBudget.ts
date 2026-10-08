// THE 2010 LIK PAYROLL BUDGET — per-employee pay and benefits, allocated to
// the entities and on down to each building. It is the owner's "Payroll
// Budget" workbook, rebuilt: the same four sheets in the same order.
//
//   1. PAY & TAXES   annual salary (or per pay × 26), FICA 6.2% to the wage
//                    base, Medicare 1.45% to $200,000 (as the workbook caps
//                    it), UC (a flat amount each), FUTA 6% of $7,000, workers'
//                    comp, 401(k) as a % of salary → GROSS annual total.
//   2. HEALTH        Life / Dental / LTD / STD / Vision (annual) + the monthly
//                    medical premium × 12 = the medical column on sheet 1.
//   3. ALLOCATION %  each employee across LIK Operating / Other, JV III,
//                    NI LLC, SC, Office Works Direct / Indirect, Marketing-All,
//                    Interstate, Middletown, Eastwick — must total 100%.
//   4. BY BUILDING   each entity's share spread over its buildings: salaries &
//                    wages (6010-8501) and maintenance salaries (6030-8502) on
//                    their own basis per fund, marketing via the SC / NI / JV
//                    split, and the misc entities (2010, 0800, 4900, Eastwick).
//
// Which account an employee lands on is their GROUP: the maintenance staff
// (Loiseau, Masciantonio, Gosik) are Maintenance Salaries 6030-8502 — their SC
// shares are the 2026 workbook's $118,748 to the dollar — and everyone else is
// Salaries & Wages 6010-8501.
//
// A building's SHARE is read off the entity's table, and each (fund, account)
// uses the basis the workbook uses: plain PRS (square footage) or the "Alt
// PRS" that leaves a building out — 9510 carries no 6010 or marketing at the
// shopping centres, 40C0 no 6030 at NI LLC, and JV III is 30 / 35 / 35.
//
// This is the payroll the other books ALLOCATE (`books.ts` → `lik-payroll`
// feeds shopping-centers, jv3, ni-llc) and the table Harry's Payroll Invoicer
// will read (employee × building %, recoverable = maintenance). PAYROLL IS
// DREW'S AND ALISON'S ALONE (`canSeePayroll`) — every route that serves this
// is gated on it.
//
// Pure: storage is `payrollBudgetStore.ts`.

export const ALLOC_COLUMNS = [
  { key: "likOperating", label: "Operating", group: "LIK" },
  { key: "likOther", label: "Other", group: "LIK" },
  { key: "jv3", label: "JV III", group: "" },
  { key: "niLlc", label: "NI LLC", group: "" },
  { key: "sc", label: "SC", group: "" },
  { key: "owDirect", label: "Direct", group: "Office Works" },
  { key: "owIndirect", label: "Indirect", group: "Office Works" },
  { key: "marketing", label: "Marketing-All", group: "" },
  { key: "interstate", label: "Interstate", group: "" },
  { key: "middletown", label: "Middletown", group: "" },
  { key: "eastwick", label: "Eastwick", group: "" },
  // Butler & Main (9000) — offered so a salary CAN be allocated there; no one
  // is today (owner).
  { key: "butlerMain", label: "Butler & Main", group: "" },
] as const;
export type AllocKey = (typeof ALLOC_COLUMNS)[number]["key"];

export const FRINGE = ["life", "dental", "ltd", "std", "vision"] as const;
export type FringeKey = (typeof FRINGE)[number];

/** Salaries & Wages (6010-8501) or Maintenance Salaries (6030-8502). */
export type PayGroup = "office" | "maintenance";
export const GROUP_GL: Record<PayGroup, string> = { office: "6010-8501", maintenance: "6030-8502" };

export type PayrollEmployee = {
  id: string;
  name: string;
  group: PayGroup;
  /** Annual salary. Per pay is derived (÷ pays); typing per pay sets this. */
  salary: number;
  /** Unemployment comp — a flat annual amount per employee. */
  uc: number;
  /** FUTA applies (6% of the first $7,000). */
  futa: boolean;
  workComp: number;
  /** Annual premiums. */
  fringe: Record<FringeKey, number>;
  /** The monthly medical premium; × 12 on sheet 1. */
  medicalMonthly: number;
  /** 401(k) employer match, % of salary. */
  k401Pct: number;
  /** % of this employee to each entity — sums to 100. */
  alloc: Partial<Record<AllocKey, number>>;
  /** A one-time bonus — wages for FICA / Medicare / FUTA, not for the 401(k)
   *  match (a % of SALARY). Only the "Test a raise" sandbox sets it; it is
   *  never saved (`sanitizePayrollDoc` does not carry it). */
  bonus?: number;
};

export type Rates = {
  pays: number;
  ficaPct: number; ficaBase: number;
  mediPct: number; mediBase: number;
  futaPct: number; futaBase: number;
};

/** One fund's buildings: square footage and the "Alt PRS" the workbook keys
 *  where a building is left out or the split is rounded. */
export type FundTable = {
  buildings: { code: string; sqft: number; altPct: number }[];
  /** Which share each account uses: plain PRS (sq ft) or Alt PRS. */
  basis: { office: "prs" | "alt"; maintenance: "prs" | "alt"; marketing: "prs" | "alt" };
};
export type FundKey = "sc" | "niLlc" | "jv3";

export type PayrollBudgetDoc = {
  year: number;
  rates: Rates;
  employees: PayrollEmployee[];
  funds: Record<FundKey, FundTable>;
  /** Marketing-All split across the funds, % (SC 46 / NI LLC 34 / JV III 20). */
  marketingSplit: Record<FundKey, number>;
  /** The year's raise plan — tentative, never in the figures above until
   *  applied (`raisePlanImpact`). */
  raisePlan?: RaisePlan;
  /** Where the doc came from, when it was seeded. */
  seededFrom?: string;
  updatedBy?: string;
  updatedAt?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

// ─── Sheets 1 + 2: pay, taxes and benefits ─────────────────────────────────
export type EmployeeCost = {
  perPay: number; salary: number; bonus: number;
  fica: number; medi: number; uc: number; futa: number; workComp: number;
  fringe: number; medicalAnnual: number; medical: number;
  k401: number; gross: number;
};

export function employeeCost(e: PayrollEmployee, r: Rates): EmployeeCost {
  const salary = e.salary || 0;
  const bonus = e.bonus || 0;
  const wages = salary + bonus;
  const fica = Math.min(wages, r.ficaBase) * r.ficaPct / 100;
  const medi = Math.min(wages, r.mediBase) * r.mediPct / 100;
  const futa = e.futa ? Math.min(wages, r.futaBase) * r.futaPct / 100 : 0;
  const fringe = sum(FRINGE.map((k) => e.fringe?.[k] || 0));
  const medicalAnnual = (e.medicalMonthly || 0) * 12;
  const medical = fringe + medicalAnnual;
  const k401 = salary * (e.k401Pct || 0) / 100;
  const gross = wages + fica + medi + (e.uc || 0) + futa + (e.workComp || 0) + medical + k401;
  return {
    perPay: r.pays ? salary / r.pays : 0, salary, bonus,
    fica: r2(fica), medi: r2(medi), uc: e.uc || 0, futa: r2(futa), workComp: e.workComp || 0,
    fringe: r2(fringe), medicalAnnual: r2(medicalAnnual), medical: r2(medical),
    k401: r2(k401), gross: r2(gross),
  };
}

export const allocTotal = (e: PayrollEmployee) => sum(ALLOC_COLUMNS.map((c) => e.alloc?.[c.key] || 0));

// ─── Sheet 3: each employee's gross to each entity ─────────────────────────
/** Gross × allocation %, by entity column. */
export function entityDollars(e: PayrollEmployee, r: Rates): Record<AllocKey, number> {
  const g = employeeCost(e, r).gross;
  const out = {} as Record<AllocKey, number>;
  for (const c of ALLOC_COLUMNS) out[c.key] = g * (e.alloc?.[c.key] || 0) / 100;
  return out;
}

// ─── Sheet 4: down to the building ─────────────────────────────────────────
export function fundShares(t: FundTable, basis: "prs" | "alt"): Record<string, number> {
  const out: Record<string, number> = {};
  if (basis === "alt") {
    const tot = sum(t.buildings.map((b) => b.altPct));
    for (const b of t.buildings) out[b.code] = tot ? b.altPct / tot : 0;
  } else {
    const tot = sum(t.buildings.map((b) => b.sqft));
    for (const b of t.buildings) out[b.code] = tot ? b.sqft / tot : 0;
  }
  return out;
}

export type BuildingRow = { code: string; sqft: number; prs: number; altPct: number; office: number; maintenance: number; marketing: number; total: number };
export type FundAllocation = { fund: FundKey; label: string; office: number; maintenance: number; marketing: number; rows: BuildingRow[] };
export type MiscAllocation = { key: string; label: string; code: string | null; annual: number; parts: { label: string; annual: number }[] };

export type PayrollAllocation = {
  employees: (EmployeeCost & { id: string; name: string; group: PayGroup; allocTotal: number })[];
  totals: EmployeeCost;
  /** Each entity column's dollars, office vs maintenance. */
  byEntity: Record<AllocKey, { office: number; maintenance: number; total: number }>;
  funds: FundAllocation[];
  misc: MiscAllocation[];
  marketing: { total: number; byFund: Record<FundKey, number> };
  /** Everything allocated — must equal gross payroll. */
  allocated: number;
};

const FUND_LABEL: Record<FundKey, string> = { sc: "Shopping Centers", niLlc: "NI LLC", jv3: "JV III" };

export function allocatePayroll(doc: PayrollBudgetDoc): PayrollAllocation {
  const r = doc.rates;
  const byEntity = {} as PayrollAllocation["byEntity"];
  for (const c of ALLOC_COLUMNS) byEntity[c.key] = { office: 0, maintenance: 0, total: 0 };
  const employees = doc.employees.map((e) => {
    const cost = employeeCost(e, r);
    const d = entityDollars(e, r);
    for (const c of ALLOC_COLUMNS) {
      byEntity[c.key][e.group] += d[c.key];
      byEntity[c.key].total += d[c.key];
    }
    return { ...cost, id: e.id, name: e.name, group: e.group, allocTotal: allocTotal(e) };
  });
  const keys: (keyof EmployeeCost)[] = ["perPay", "salary", "bonus", "fica", "medi", "uc", "futa", "workComp", "fringe", "medicalAnnual", "medical", "k401", "gross"];
  const totals = Object.fromEntries(keys.map((k) => [k, r2(sum(employees.map((x) => x[k] as number)))])) as EmployeeCost;

  const mkt = byEntity.marketing.total;
  const splitTot = sum(Object.values(doc.marketingSplit));
  const byFund = { sc: 0, niLlc: 0, jv3: 0 } as Record<FundKey, number>;
  for (const f of Object.keys(byFund) as FundKey[]) byFund[f] = splitTot ? mkt * (doc.marketingSplit[f] || 0) / splitTot : 0;

  const funds: FundAllocation[] = (["sc", "niLlc", "jv3"] as FundKey[]).map((f) => {
    const t = doc.funds[f];
    const office = byEntity[f].office, maintenance = byEntity[f].maintenance, marketing = byFund[f];
    const sOff = fundShares(t, t.basis.office), sMnt = fundShares(t, t.basis.maintenance), sMkt = fundShares(t, t.basis.marketing);
    const prs = fundShares(t, "prs");
    const rows = t.buildings.map((b) => {
      const o = office * sOff[b.code], m = maintenance * sMnt[b.code], k = marketing * sMkt[b.code];
      return { code: b.code, sqft: b.sqft, prs: prs[b.code], altPct: b.altPct, office: o, maintenance: m, marketing: k, total: o + m + k };
    });
    return { fund: f, label: FUND_LABEL[f], office, maintenance, marketing, rows };
  });

  const e = byEntity;
  const misc: MiscAllocation[] = [
    { key: "2010", label: "LIK Management", code: "2010", annual: e.likOperating.total + e.likOther.total,
      parts: [{ label: "Operating", annual: e.likOperating.total }, { label: "Other", annual: e.likOther.total }] },
    { key: "0800", label: "Interstate (incl. Bellmawr) and Middletown", code: "0800", annual: e.interstate.total + e.middletown.total,
      parts: [{ label: "Interstate", annual: e.interstate.total }, { label: "Middletown", annual: e.middletown.total }] },
    { key: "4900", label: "The Office Works", code: "4900", annual: e.owDirect.total + e.owIndirect.total,
      parts: [{ label: "Direct", annual: e.owDirect.total }, { label: "Indirect", annual: e.owIndirect.total }] },
    { key: "eastwick", label: "Eastwick JV", code: null, annual: e.eastwick.total, parts: [] },
    { key: "9000", label: "Butler & Main", code: "9000", annual: e.butlerMain.total, parts: [] },
  ];

  const allocated = sum(funds.map((f) => f.office + f.maintenance + f.marketing)) + sum(misc.map((m) => m.annual));
  return { employees, totals, byEntity, funds, misc, marketing: { total: mkt, byFund }, allocated };
}

/** One employee's dollars landing on one building / entity. */
export type BuildingEmployeeRow = {
  id: string; name: string; group: PayGroup;
  /** Salaries & Wages 6010-8501 (office) or Maintenance Salaries 6030-8502. */
  office: number; maintenance: number; marketing: number; total: number;
};

/** Every employee's share of one building (a fund row's code) or one misc
 *  entity (2010, 0800, 4900, 9000, "eastwick") — the same arithmetic as
 *  `allocatePayroll`, per employee, so the rows add to that building's row. */
export function employeesForBuilding(doc: PayrollBudgetDoc, code: string): BuildingEmployeeRow[] {
  const r = doc.rates;
  const fund = (["sc", "niLlc", "jv3"] as FundKey[]).find((f) => doc.funds[f].buildings.some((b) => b.code === code));
  const MISC: Record<string, AllocKey[]> = {
    "2010": ["likOperating", "likOther"], "0800": ["interstate", "middletown"],
    "4900": ["owDirect", "owIndirect"], eastwick: ["eastwick"], "9000": ["butlerMain"],
  };
  const splitTot = sum(Object.values(doc.marketingSplit));
  const out: BuildingEmployeeRow[] = [];
  for (const e of doc.employees) {
    const d = entityDollars(e, r);
    let office = 0, maintenance = 0, marketing = 0;
    if (fund) {
      const t = doc.funds[fund];
      const own = d[fund] * (fundShares(t, e.group === "maintenance" ? t.basis.maintenance : t.basis.office)[code] || 0);
      if (e.group === "maintenance") maintenance = own; else office = own;
      const mShare = splitTot ? (doc.marketingSplit[fund] || 0) / splitTot : 0;
      marketing = d.marketing * mShare * (fundShares(t, t.basis.marketing)[code] || 0);
    } else if (MISC[code]) {
      const v = sum(MISC[code].map((k) => d[k]));
      if (e.group === "maintenance") maintenance = v; else office = v;
    }
    const total = office + maintenance + marketing;
    if (Math.abs(total) >= 0.005) out.push({ id: e.id, name: e.name, group: e.group, office, maintenance, marketing, total });
  }
  return out.sort((a, b) => b.total - a.total);
}

// ─── The raise plan: what the year's raises cost, and where it lands ───────
/** A raise as a % or $ of salary, or a one-time bonus in dollars. */
export type RaiseTest = { employeeId: string; kind: "pct" | "dollar" | "bonus"; amount: number };

/** The year's raise POOL — the control a raise is judged against: a % of
 *  this budget's SALARIES (a merit budget is quoted on base pay), or a dollar
 *  figure. It is spent in PAY dollars (salary increases + bonuses); the taxes
 *  and 401(k) on top are shown as the fully loaded cost beside it. */
export type RaisePool = { kind: "pct" | "dollar"; amount: number };
export type RaisePlan = { pool: RaisePool; raises: RaiseTest[] };
export const DEFAULT_POOL: RaisePool = { kind: "pct", amount: 3 };

export type RaiseImpactRow = {
  /** Fund label ("Shopping Centers") or "Misc". */
  group: string; code: string | null; label: string;
  before: number; after: number; delta: number;
  /** The part of `delta` on Maintenance Salaries (6030-8502) — recoverable. */
  deltaMaintenance: number;
};

export type RaiseEmployeeImpact = {
  id: string; name: string; group: PayGroup;
  before: EmployeeCost; after: EmployeeCost;
  /** Pay dollars this year: salary increase + bonus — what the pool spends. */
  pay: number;
  /** Fully loaded: pay + FICA / Medicare / FUTA + 401(k). */
  cost: number;
};

export type RaiseImpact = {
  employees: RaiseEmployeeImpact[];
  totalBefore: number; totalAfter: number;
  /** Every building and entity whose share moves, largest change first. */
  rows: RaiseImpactRow[];
};

/** The employee as the raise would leave them: a new salary, or a bonus. */
export function applyRaise(e: PayrollEmployee, t: RaiseTest): PayrollEmployee {
  const amt = Number.isFinite(t.amount) ? t.amount : 0;
  if (t.kind === "bonus") return { ...e, bonus: (e.bonus || 0) + amt };
  const salary = t.kind === "pct" ? (e.salary || 0) * (1 + amt / 100) : (e.salary || 0) + amt;
  return { ...e, salary: Math.round(salary * 100) / 100 };
}

/**
 * Re-run the whole allocation with every raise in `raises` applied and diff it
 * against the budget as it stands — the SAME taxes (FICA stopping at its wage
 * base, FUTA at $7,000), 401(k) match, allocation % and fund basis as the
 * budget itself. Several raises to one employee stack. Pure: nothing saved.
 */
export function raisePlanImpact(doc: PayrollBudgetDoc, raises: RaiseTest[]): RaiseImpact {
  const live = raises.filter((t) => t.amount && doc.employees.some((e) => e.id === t.employeeId));
  const next = { ...doc, employees: doc.employees.map((e) => live.filter((t) => t.employeeId === e.id).reduce(applyRaise, e)) };
  const a = allocatePayroll(doc), b = allocatePayroll(next);
  const rows: RaiseImpactRow[] = [];
  for (let i = 0; i < a.funds.length; i++) {
    const fa = a.funds[i], fb = b.funds[i];
    fa.rows.forEach((ra, j) => {
      const rb = fb.rows[j];
      rows.push({ group: fa.label, code: ra.code, label: ra.code, before: ra.total, after: rb.total,
        delta: rb.total - ra.total, deltaMaintenance: rb.maintenance - ra.maintenance });
    });
  }
  a.misc.forEach((ma, i) => {
    const mb = b.misc[i];
    rows.push({ group: "Misc", code: ma.code, label: ma.label, before: ma.annual, after: mb.annual, delta: mb.annual - ma.annual, deltaMaintenance: 0 });
  });
  const employees = doc.employees
    .filter((e) => live.some((t) => t.employeeId === e.id))
    .map((e, i) => {
      const n = next.employees[doc.employees.indexOf(e)];
      const before = employeeCost(e, doc.rates), after = employeeCost(n, doc.rates);
      return { id: e.id, name: e.name, group: e.group, before, after,
        pay: (after.salary - before.salary) + (after.bonus - before.bonus), cost: after.gross - before.gross };
    });
  return {
    employees,
    totalBefore: a.totals.gross, totalAfter: b.totals.gross,
    rows: rows.filter((x) => Math.abs(x.delta) >= 0.5).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)),
  };
}

/** One raise — the plan of one. */
export function raiseImpact(doc: PayrollBudgetDoc, t: RaiseTest) {
  if (!doc.employees.some((e) => e.id === t.employeeId)) return null;
  const r = raisePlanImpact(doc, [t]);
  const e = r.employees[0] ?? (() => {
    const emp = doc.employees.find((x) => x.id === t.employeeId)!;
    const c = employeeCost(emp, doc.rates);
    return { id: emp.id, name: emp.name, group: emp.group, before: c, after: c, pay: 0, cost: 0 };
  })();
  return { ...r, employee: e };
}

/** The pool in pay dollars. */
export function poolDollars(doc: PayrollBudgetDoc, pool: RaisePool): number {
  if (pool.kind === "dollar") return pool.amount || 0;
  return sum(doc.employees.map((e) => e.salary || 0)) * (pool.amount || 0) / 100;
}

/** The workbook rounds a monthly allocation to the nearest $10. */
export const monthly10 = (annual: number) => Math.round(annual / 12 / 10) * 10;

// ─── The seed: the owner's 2026 Payroll Budget workbook ────────────────────
export const DEFAULT_RATES: Rates = { pays: 26, ficaPct: 6.2, ficaBase: 184_500, mediPct: 1.45, mediBase: 200_000, futaPct: 6, futaBase: 7_000 };

const f = (life = 0, dental = 0, ltd = 0, std = 0, vision = 0): Record<FringeKey, number> => ({ life, dental, ltd, std, vision });
const E = (id: string, name: string, group: PayGroup, salary: number, uc: number, futa: boolean, workComp: number,
  fringe: Record<FringeKey, number>, medicalMonthly: number, k401: number, alloc: Partial<Record<AllocKey, number>>): PayrollEmployee =>
  ({ id, name, group, salary, uc, futa, workComp, fringe, medicalMonthly,
    // The workbook keys 401(k) as a rounded % beside the dollars; the dollars
    // are what was budgeted, so the % is read back from them.
    k401Pct: salary ? Math.round((k401 / salary) * 1e6) / 1e4 : 0, alloc });

/** The 2026 workbook, as the owner keyed it — the starting point for 2027. */
export const SEED_2026: Omit<PayrollBudgetDoc, "year"> = {
  rates: DEFAULT_RATES,
  seededFrom: "2026 Payroll Budget workbook",
  employees: [
    E("winig-drew", "Winig, Drew", "office", 165_000, 656.03, true, 363, f(115.35, 48.03, 32.17, 15.68, 6.43), 422.71, 5_775,
      { likOperating: 25, jv3: 11, niLlc: 24, sc: 35, owIndirect: 5 }),
    E("lee-randolph", "Lee, Randolph", "office", 120_000, 656.03, false, 363, f(), 0, 0,
      { likOperating: 25, jv3: 12, niLlc: 25, sc: 38 }),
    E("korman-feldman-alison", "Korman Feldman, Alison", "office", 283_005, 656.03, true, 1_527, f(74.98, 48.03, 32.17, 15.68, 6.43), 0, 19_218,
      { likOperating: 60, jv3: 3, niLlc: 6, sc: 8, marketing: 23 }),
    E("borton-rita", "Borton, Rita", "office", 9_100, 325, true, 120, f(2.46, 0, 1.70, 1.37, 0), 0, 0, { owDirect: 100 }),
    E("campbell-holley-lavalle", "Campbell-Holley, Lavalle B.", "office", 14_703, 656.03, true, 120, f(), 0, 0, { owDirect: 100 }),
    E("collier-donna", "Collier, Donna", "office", 7_371, 410, true, 111, f(), 0, 0, { owDirect: 100 }),
    E("tomlinson-tami", "Tomlinson, Tami M.", "office", 49_650, 656.03, true, 176, f(50.75, 0, 14.11, 11.33, 0), 0, 993, { owDirect: 100 }),
    E("weissman-susan", "Weissman, Susan", "office", 5_441, 393.62, true, 45, f(), 0, 102, { owDirect: 100 }),
    // The workbook shows 86% SC beside 5 / 5 / 5 — 101%. It is 85% (see
    // CLAUDE.md: his tracked total is ~94.86% because Middletown is untracked
    // in the invoicer); 85 keeps the row at 100.
    E("feldman-harry", "Feldman, Harry I.", "office", 160_000, 656.03, true, 545, f(115.35, 48.03, 32.17, 15.68, 6.43), 428.76, 5_425,
      { sc: 85, interstate: 5, middletown: 5, eastwick: 5 }),
    E("jaster-marie", "Jaster, Marie", "office", 36_598, 656.03, true, 503, f(), 0, 5_050, { jv3: 16, niLlc: 34, sc: 50 }),
    E("rovkin-tatyana", "Rovkin, Tatyana", "office", 53_721, 656.03, true, 450, f(55.37, 48.03, 15.28, 12.28, 6.43), 1_115.15, 1_383, { jv3: 16, niLlc: 34, sc: 50 }),
    E("loiseau-charles", "Loiseau, Charles", "maintenance", 60_522, 656.03, true, 450, f(62.29, 48.03, 17.37, 13.96, 6.43), 458.60, 2_797, { jv3: 16, niLlc: 34, sc: 50 }),
    E("fox-nancy", "Fox, Nancy L.", "office", 67_540, 656.03, true, 526, f(70.98, 97.51, 30.27, 15.68, 12.10), 0, 9_456, { jv3: 29, niLlc: 61, owIndirect: 10 }),
    E("masciantonio-gregory", "Masciantonio, Gregory L.", "maintenance", 108_258, 656.03, true, 503, f(109.97, 0, 30.56, 15.68, 0), 0, 5_413, { jv3: 21, niLlc: 44, sc: 35 }),
    E("gosik-jason", "Gosik, Jason N.", "maintenance", 64_228, 656.03, true, 403, f(57.68, 0, 16.08, 12.92, 0), 0, 5_081, { jv3: 16, niLlc: 34, sc: 50 }),
  ],
  funds: {
    sc: {
      buildings: [
        { code: "1100", sqft: 8_287, altPct: 2.99 }, { code: "1500", sqft: 2_280, altPct: 0.82 },
        { code: "2300", sqft: 61_572, altPct: 22.24 }, { code: "4500", sqft: 82_809, altPct: 29.92 },
        { code: "5600", sqft: 1_326, altPct: 0.48 }, { code: "7010", sqft: 73_209, altPct: 26.45 },
        { code: "7200", sqft: 14_821, altPct: 5.35 }, { code: "7300", sqft: 22_500, altPct: 8.13 },
        { code: "8200", sqft: 10_000, altPct: 3.61 }, { code: "9510", sqft: 19_983, altPct: 0 },
      ],
      basis: { office: "alt", maintenance: "prs", marketing: "alt" },
    },
    niLlc: {
      buildings: [
        { code: "4050", sqft: 54_008, altPct: 14.24 }, { code: "4060", sqft: 107_890, altPct: 28.44 },
        { code: "4070", sqft: 61_508, altPct: 16.22 }, { code: "4080", sqft: 127_848, altPct: 33.70 },
        { code: "40A0", sqft: 15_083, altPct: 3.98 }, { code: "40B0", sqft: 12_978, altPct: 3.42 },
        { code: "40C0", sqft: 18_000, altPct: 0 },
      ],
      basis: { office: "prs", maintenance: "alt", marketing: "prs" },
    },
    jv3: {
      buildings: [
        { code: "3610", sqft: 41_821, altPct: 30 }, { code: "3620", sqft: 49_020, altPct: 35 }, { code: "3640", sqft: 48_794, altPct: 35 },
      ],
      basis: { office: "alt", maintenance: "alt", marketing: "alt" },
    },
  },
  marketingSplit: { sc: 46, niLlc: 34, jv3: 20 },
};

/** A new year's doc: last year's as it stood, to be keyed over. */
export function seedPayrollBudget(year: number, from?: PayrollBudgetDoc | null): PayrollBudgetDoc {
  const src = from ?? { ...SEED_2026, year: 2026 };
  return { ...JSON.parse(JSON.stringify(src)), year, seededFrom: from ? `${from.year} Payroll Budget` : SEED_2026.seededFrom, updatedBy: undefined, updatedAt: undefined };
}

/** Clean a doc posted from the page: numbers are numbers, ids are unique,
 *  allocation keys are the known columns. */
export function sanitizePayrollDoc(raw: any, year: number): PayrollBudgetDoc | null {
  if (!raw || !Array.isArray(raw.employees)) return null;
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const seen = new Set<string>();
  const employees: PayrollEmployee[] = raw.employees.slice(0, 200).map((e: any, i: number) => {
    let id = String(e?.id ?? "").trim().slice(0, 80) || `emp-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const alloc: Partial<Record<AllocKey, number>> = {};
    for (const c of ALLOC_COLUMNS) { const v = n(e?.alloc?.[c.key]); if (v) alloc[c.key] = v; }
    return {
      id, name: String(e?.name ?? "").slice(0, 120),
      group: e?.group === "maintenance" ? "maintenance" : "office",
      salary: n(e?.salary), uc: n(e?.uc), futa: e?.futa !== false, workComp: n(e?.workComp),
      fringe: Object.fromEntries(FRINGE.map((k) => [k, n(e?.fringe?.[k])])) as Record<FringeKey, number>,
      medicalMonthly: n(e?.medicalMonthly), k401Pct: n(e?.k401Pct), alloc,
    };
  });
  const rates = { ...DEFAULT_RATES } as Rates;
  for (const k of Object.keys(DEFAULT_RATES) as (keyof Rates)[]) if (raw.rates?.[k] != null) rates[k] = n(raw.rates[k]);
  const funds = {} as Record<FundKey, FundTable>;
  for (const fk of ["sc", "niLlc", "jv3"] as FundKey[]) {
    const t = raw.funds?.[fk] ?? SEED_2026.funds[fk];
    const pick = (v: unknown): "prs" | "alt" => (v === "alt" ? "alt" : "prs");
    funds[fk] = {
      buildings: (Array.isArray(t.buildings) ? t.buildings : SEED_2026.funds[fk].buildings).map((b: any) => ({ code: String(b.code).slice(0, 12), sqft: n(b.sqft), altPct: n(b.altPct) })),
      basis: { office: pick(t.basis?.office), maintenance: pick(t.basis?.maintenance), marketing: pick(t.basis?.marketing) },
    };
  }
  const ms = raw.marketingSplit ?? SEED_2026.marketingSplit;
  const rp = raw.raisePlan;
  const ids = new Set(employees.map((e) => e.id));
  const raisePlan: RaisePlan | undefined = rp && typeof rp === "object" ? {
    pool: { kind: rp.pool?.kind === "dollar" ? "dollar" : "pct", amount: n(rp.pool?.amount ?? DEFAULT_POOL.amount) },
    raises: (Array.isArray(rp.raises) ? rp.raises : []).slice(0, 200)
      .filter((t: any) => ids.has(String(t?.employeeId)))
      .map((t: any) => ({ employeeId: String(t.employeeId), kind: t.kind === "dollar" || t.kind === "bonus" ? t.kind : "pct", amount: n(t.amount) })),
  } : undefined;
  return {
    year, rates, employees, funds, raisePlan,
    marketingSplit: { sc: n(ms.sc), niLlc: n(ms.niLlc), jv3: n(ms.jv3) },
    seededFrom: typeof raw.seededFrom === "string" ? raw.seededFrom.slice(0, 120) : undefined,
  };
}
