import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_4070_WORKBOOK as POOL_4070, TENANTS_4070_2025 } from "./seed/4070";
import { EXPENSE_SUMMARY_SEED, finalsFromSummary, mergeExpenseSummary } from "./expenseSummary";

const r2 = (n: number) => Math.round(n * 100) / 100;

describe("Final Expense Summary overrides", () => {
  it("seed FINALs equal the pool — recon unchanged", () => {
    const finals = finalsFromSummary(EXPENSE_SUMMARY_SEED["4070"][2025]);
    const withFinals = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025, finals);
    const noFinals = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025);
    expect(r2(withFinals.totals.opexBalance)).toBe(r2(noFinals.totals.opexBalance));
    expect(r2(withFinals.totals.retBalance)).toBe(r2(noFinals.totals.retBalance));
  });

  it("raising a FINAL raises recovery; scales the 95% gross-up variant", () => {
    const finals = finalsFromSummary(EXPENSE_SUMMARY_SEED["4070"][2025]);
    const base = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025, finals);
    // Bump Management Fee FINAL by $10,000 (a gross-up account).
    finals["6610-8502"] = finals["6610-8502"] + 10000;
    const bumped = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025, finals);
    // A grossed-up, full-year tenant should now recover more.
    const beforeT = base.tenants.find((t) => t.unitRef === "4070-301")!;
    const afterT = bumped.tenants.find((t) => t.unitRef === "4070-301")!;
    expect(afterT.opexAmountDue).toBeGreaterThan(beforeT.opexAmountDue);
  });

  it("variance is Avid − TB Detail", () => {
    const rows = mergeExpenseSummary("4070", 2025, {});
    const bldg = rows.find((r) => r.account === "6220-8502")!;
    expect(r2(bldg.variance)).toBe(r2(bldg.excelAvid - bldg.tbDetail));
    expect(r2(bldg.variance)).toBe(-65508.25);
  });

  it("an override changes FINAL + variance on read", () => {
    const rows = mergeExpenseSummary("4070", 2025, { "6380-8502": { final: 20000, excelAvid: 5000 } });
    const land = rows.find((r) => r.account === "6380-8502")!;
    expect(land.final).toBe(20000);
    expect(r2(land.variance)).toBe(r2(5000 - land.tbDetail));
  });
});
