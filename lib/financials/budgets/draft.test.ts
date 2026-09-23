import { describe, it, expect, vi } from "vitest";

const loadReprojection = vi.fn();
vi.mock("@/lib/financials/reprojections/load", () => ({ loadReprojection: (...a: any[]) => loadReprojection(...a) }));

const projectLeaseRevenue = vi.fn();
vi.mock("./leaseRevenue", () => ({ projectLeaseRevenue: (...a: any[]) => projectLeaseRevenue(...a) }));

vi.mock("./reimbursementEstimate", () => ({ estimateReimbursements: async () => null }));
vi.mock("./leasingAssumptions", () => ({ getLeasingAssumptions: async () => ({}) }));
let typedDoc: Record<string, any> = {};
vi.mock("./lineOverrideStore", () => ({ getLineOverrides: async () => typedDoc }));

const noLeases = { rentalMonthly: new Array(12).fill(0), rentalTotal: 0, inPlaceUnits: 0, expiring: [], vacant: [], hasData: false };

import { buildBudgetDraft } from "./draft";

const line = (label: string, mask: string, monthly: number) => ({
  label, mask, actual: [], budget: [], blended: new Array(12).fill(monthly), reprojTotal: monthly * 12, budgetTotal: 0, variance: null,
});
const section = (name: string, role: string, lines: any[]) => ({ name, role, lines, subtotal: {} as any });

function fakeReproj() {
  return {
    reprojection: {
      propertyCode: "1100", propertyName: "Parkwood", year: 2026, actualThroughMonth: 7,
      sections: [
        section("Revenues", "revenue", [line("Rental income", "4*", 5000)]),
        section("Non-Reimbursable Expenses", "non-reimbursable-expense", [line("Utilities", "6*", 1000)]),
        section("Debt Service", "debt-service", [line("Mortgage", "9*", 2000)]),
      ],
      rollups: {} as any, unbudgetedAccounts: [],
    },
    meta: { propertyCode: "1100", propertyName: "Parkwood", year: 2026, budgetYear: 2026 },
    notes: {},
  };
}

describe("buildBudgetDraft", () => {
  it("grows expenses by the % but carries revenue and debt flat", async () => {
    loadReprojection.mockResolvedValue(fakeReproj());
    projectLeaseRevenue.mockResolvedValue(noLeases);
    const d = (await buildBudgetDraft("1100", 2027, 3))!;
    expect(d.basisYear).toBe(2026);

    const rev = d.sections.find((s) => s.role === "revenue")!.lines[0];
    expect(rev.months.every((m) => m === 5000)).toBe(true);   // flat
    expect(rev.source).toBe("reproj-flat");

    const exp = d.sections.find((s) => s.role === "non-reimbursable-expense")!.lines[0];
    expect(exp.months.every((m) => m === 1030)).toBe(true);   // 1000 × 1.03
    expect(exp.source).toBe("reproj-growth");
    expect(exp.basisTotal).toBe(12000);

    const debt = d.sections.find((s) => s.role === "debt-service")!.lines[0];
    expect(debt.months.every((m) => m === 2000)).toBe(true);  // flat

    // Rollups: revenue 60k, opex 12.36k (grown), NOI = 47.64k. Debt is below NOI.
    expect(d.rollups.totalRevenues.total).toBe(60000);
    expect(d.rollups.totalOperatingExpenses.total).toBe(12360);
    expect(d.rollups.netOperatingIncome.total).toBe(47640);
  });

  it("replaces the rental line with the lease projection and surfaces leasing flags", async () => {
    loadReprojection.mockResolvedValue(fakeReproj());
    projectLeaseRevenue.mockResolvedValue({
      rentalMonthly: new Array(12).fill(6000), rentalTotal: 72000, inPlaceUnits: 3,
      expiring: [{ unitRef: "1100-5", tenant: "Acme", leaseTo: "6/30/2027", monthlyRent: 2000, annualRent: 24000, holdover: false }],
      vacant: [{ unitRef: "1100-9", sqft: 800 }], hasData: true,
    });
    const d = (await buildBudgetDraft("1100", 2027, 3))!;
    const rev = d.sections.find((s) => s.role === "revenue")!.lines[0];
    expect(rev.source).toBe("leases");
    expect(rev.total).toBe(72000);              // from the lease projection, not 60k reproj
    expect(d.rollups.totalRevenues.total).toBe(72000);
    expect(d.leasing?.inPlaceUnits).toBe(3);
    expect(d.leasing?.expiring).toHaveLength(1);
    expect(d.leasing?.vacant).toHaveLength(1);
  });

  it("returns null when there's no current-year reprojection to seed from", async () => {
    loadReprojection.mockResolvedValue(null);
    projectLeaseRevenue.mockResolvedValue(noLeases);
    expect(await buildBudgetDraft("9999", 2027, 3)).toBeNull();
  });

  it("drops an empty Condo Assn line from a shopping centre, but keeps one that carries money", async () => {
    const r = fakeReproj();
    (r.reprojection.sections as any[]).push(section("Reimbursements", "reimbursement", [line("Condo Assn", "4970-*", 0)]));
    loadReprojection.mockResolvedValue(r);
    projectLeaseRevenue.mockResolvedValue(noLeases);
    const d = (await buildBudgetDraft("1100", 2027, 3))!;   // 1100 is a shopping centre
    expect(d.sections.flatMap((s) => s.lines).some((l) => l.label === "Condo Assn")).toBe(false);

    const r2 = fakeReproj();
    (r2.reprojection.sections as any[]).push(section("Reimbursements", "reimbursement", [line("Condo Assn", "4970-*", 50)]));
    loadReprojection.mockResolvedValue(r2);
    const d2 = (await buildBudgetDraft("1100", 2027, 3))!;
    expect(d2.sections.flatMap((s) => s.lines).some((l) => l.label === "Condo Assn")).toBe(true);
  });

  it("0% growth carries expenses flat too", async () => {
    loadReprojection.mockResolvedValue(fakeReproj());
    projectLeaseRevenue.mockResolvedValue(noLeases);
    const d = (await buildBudgetDraft("1100", 2027, 0))!;
    const exp = d.sections.find((s) => s.role === "non-reimbursable-expense")!.lines[0];
    expect(exp.months.every((m) => m === 1000)).toBe(true);
  });

  it("keeps a multi-account line's GL sub-lines, each grown on its own months, the line their sum", async () => {
    const r = fakeReproj();
    const bm = line("Office Center/Other", "6220-8502,6220-8503", 700) as any;
    bm.accounts = [
      { account: "6220-8502", actual: [], budget: [], blended: new Array(12).fill(500) },
      { account: "6220-8503", actual: [], budget: [], blended: new Array(12).fill(200) },
    ];
    (r.reprojection.sections[1].lines as any[]).push(bm);
    (r.reprojection as any).accountNames = { "6220-8502": "Bldg Maint - CAM" };
    loadReprojection.mockResolvedValue(r);
    projectLeaseRevenue.mockResolvedValue(noLeases);
    const d = (await buildBudgetDraft("1100", 2027, 3))!;
    const l = d.sections.find((s) => s.role === "non-reimbursable-expense")!.lines.find((x) => x.label === "Office Center/Other")!;
    expect(l.subLines?.map((x) => x.account)).toEqual(["6220-8502", "6220-8503"]);
    expect(l.subLines?.[0].months[0]).toBe(515);   // 500 × 1.03
    expect(l.subLines?.[1].months[0]).toBe(206);   // 200 × 1.03
    expect(l.months[0]).toBe(721);                  // their sum
    expect(l.subLines?.[0].name).toBe("Bldg Maint - CAM");
    expect(l.subLines?.every((x) => x.typeable)).toBe(true);
  });

  it("budgets a bucketed line through its buckets — the base is the line, a typed Big Project adds once", async () => {
    const r = fakeReproj();
    const ls = line("Landscaping", "6400-*", 1000) as any;
    ls.accounts = [
      { account: "6400-8502", actual: [], budget: [], blended: new Array(12).fill(600) },
      { account: "6400-8503", actual: [], budget: [], blended: new Array(12).fill(400) },
    ];
    (r.reprojection.sections[1].lines as any[]).push(ls);
    loadReprojection.mockResolvedValue(r);
    projectLeaseRevenue.mockResolvedValue(noLeases);
    typedDoc = { "Non-Reimbursable Expenses::Landscaping#Big Projects": { months: [5000, null, null, null, null, null, null, null, null, null, null, null] } };
    try {
      const d = (await buildBudgetDraft("1100", 2027, 3))!;
      const l = d.sections.find((s) => s.role === "non-reimbursable-expense")!.lines.find((x) => x.label === "Landscaping")!;
      expect(l.subLines?.map((x) => x.account)).toEqual(["Contractual", "Recurring", "Big Projects"]);   // buckets, not accounts
      expect(l.subLines?.find((x) => x.bucket === "base")?.months[0]).toBe(1030);
      expect(l.subLines?.find((x) => x.account === "Big Projects")?.total).toBe(5000);
      expect(l.months[0]).toBe(6030);          // 1,030 + 5,000 — once, though applyTyped runs twice
      expect(l.total).toBe(1030 * 12 + 5000);
    } finally { typedDoc = {}; }
  });

  it("keeps capital BELOW NOI — it is not an operating expense", async () => {
    const r = fakeReproj();
    (r.reprojection.sections as any[]).splice(2, 0, section("Capital", "capital", [line("Tenant improvements", "1440-0000", 5000)]));
    loadReprojection.mockResolvedValue(r);
    projectLeaseRevenue.mockResolvedValue(noLeases);
    const d = (await buildBudgetDraft("1100", 2027, 3))!;
    expect(d.rollups.totalOperatingExpenses.total).toBe(12360);   // utilities only
    expect(d.rollups.netOperatingIncome.total).toBe(47640);       // untouched by capital
  });
});

import { tieRecoveries } from "./draft";

describe("tieRecoveries", () => {
  const sec = (lines: any[]) => [{ name: "Reimbursements", role: "reimbursement", lines, subtotal: [], total: 0 }] as any;
  const l = (label: string, mask: string, months: number[]) => ({ label, mask, months, total: months.reduce((a, b) => a + b, 0), basisTotal: 0, source: "cam-estimate" });
  const est = { kind: "retail" as const, monthly: { cam: new Array(12).fill(100), ins: new Array(12).fill(10), ret: new Array(12).fill(50) } };

  it("ties a category split across two lines, month by month", () => {
    const t = tieRecoveries(est, sec([
      l("Common Area Maintenance", "4910-0000", new Array(12).fill(60)),
      l("CAM - Other", "4910-8501", new Array(12).fill(40)),
      l("Insurance", "4930-0000", new Array(12).fill(10)),
      l("Real Estate Taxes", "4920-0000", new Array(12).fill(50)),
    ]));
    expect(t.map((x) => x.ties)).toEqual([true, true, true]);
    expect(t[0].lines).toHaveLength(2);
  });

  it("flags a category with money and no line to land on", () => {
    const t = tieRecoveries(est, sec([
      l("Common Area Maintenance", "4910-0000", new Array(12).fill(100)),
      l("Real Estate Taxes", "4920-0000", new Array(12).fill(50)),
    ]));
    const ins = t.find((x) => x.basis === "ins")!;
    expect(ins.ties).toBe(false);
    expect(ins.lines).toHaveLength(0);
    expect(ins.estimateTotal).toBe(120);
  });
});

import { combineTenantRevenue } from "./draft";

describe("combineTenantRevenue", () => {
  const f = (n: number) => new Array(12).fill(n);
  const rr = (unitRef: string, tenant: string, rent: number, status: any = "contracted") => ({ unitRef, tenant, sqft: 1000, months: f(rent), assumed: new Array(12).fill(false), status });
  const t = (unitRef: string, cam: number) => ({ unitRef, name: "x", cam: f(cam), ins: f(0), ret: f(0), assumed: new Array(12).fill(false), monthsActive: 12, camAnnual: 0, insAnnual: 0, retAnnual: 0, camMonthly: 0, insMonthly: 0, retMonthly: 0 });

  it("keeps every rent suite (vacancies too), in order, with its recoveries beside it", () => {
    const rows = combineTenantRevenue(
      [rr("A-1", "Acme", 1000), rr("A-2", "", 0, "vacant"), rr("A-3", "Gross Co", 800)],
      { tenants: [t("A-1-CU", 200)] } as any,
    );
    expect(rows.map((r) => r.unitRef)).toEqual(["A-1", "A-2", "A-3"]);
    expect(rows[0].cam[0]).toBe(200);
    expect(rows[1].rent[0] + rows[1].cam[0]).toBe(0);
    expect(rows[2].cam[0]).toBe(0);
  });

  it("appends a recovery with no rent-side suite rather than dropping it", () => {
    const rows = combineTenantRevenue([rr("A-1", "Acme", 1000)], { tenants: [t("Z-9", 50)] } as any);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ unitRef: "Z-9", recoveryOnly: true });
  });
});
