import { describe, it, expect, vi } from "vitest";

const loadReprojection = vi.fn();
vi.mock("@/lib/financials/reprojections/load", () => ({ loadReprojection: (...a: any[]) => loadReprojection(...a) }));

const projectLeaseRevenue = vi.fn();
vi.mock("./leaseRevenue", () => ({ projectLeaseRevenue: (...a: any[]) => projectLeaseRevenue(...a) }));

vi.mock("./reimbursementEstimate", () => ({ estimateReimbursements: async () => null }));
vi.mock("./leasingAssumptions", () => ({ getLeasingAssumptions: async () => ({}) }));

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

  it("0% growth carries expenses flat too", async () => {
    loadReprojection.mockResolvedValue(fakeReproj());
    projectLeaseRevenue.mockResolvedValue(noLeases);
    const d = (await buildBudgetDraft("1100", 2027, 0))!;
    const exp = d.sections.find((s) => s.role === "non-reimbursable-expense")!.lines[0];
    expect(exp.months.every((m) => m === 1000)).toBe(true);
  });
});
