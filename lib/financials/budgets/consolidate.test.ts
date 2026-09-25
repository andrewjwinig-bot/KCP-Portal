import { describe, expect, it } from "vitest";
import { consolidateDrafts } from "./consolidate";

const m = (v: number) => new Array(12).fill(v);
const line = (label: string, v: number, extra: any = {}) => ({ label, mask: "", months: m(v), total: v * 12, basisTotal: v * 11, source: "reproj-growth", ...extra });
const draft = (code: string, name: string, rent: number, snow: number, extraLine?: any) => ({
  propertyCode: code, propertyName: name, budgetYear: 2027, basisYear: 2026, growthPct: 3,
  sections: [
    { name: "Revenues", role: "revenue", lines: [line("Rental income", rent)], subtotal: m(rent), total: rent * 12 },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [line("Snow Removal", snow), ...(extraLine ? [extraLine] : [])], subtotal: m(snow), total: snow * 12 },
  ],
  rollups: { totalRevenues: { months: m(rent), total: rent * 12 }, totalOperatingExpenses: { months: m(snow), total: snow * 12 }, netOperatingIncome: { months: m(rent - snow), total: (rent - snow) * 12 } },
  tenantRevenue: [{ unitRef: `${code}-1`, sqft: 1000 }],
}) as any;

describe("a book's roll-up", () => {
  const all = consolidateDrafts("All Shopping Centers", [
    draft("1100", "Andorra", 1000, 100),
    draft("2300", "Brookwood", 3000, 200, line("Security", 50)),
  ])!;
  it("sums each line across the properties, month by month", () => {
    const rent = all.sections[0].lines[0];
    expect(rent.months[0]).toBe(4000);
    expect(rent.total).toBe(48000);
    expect(rent.basisTotal).toBe(44000);
    expect(all.sections[0].total).toBe(48000);
  });
  it("keeps a line only one property carries", () => {
    const sec = all.sections[1];
    expect(sec.lines.map((l) => l.label)).toEqual(["Snow Removal", "Security"]);
    expect(sec.total).toBe((300 + 50) * 12);
  });
  it("carries each line's split by property, for its detail", () => {
    const snow = all.sections[1].lines[0];
    expect(snow.byProperty).toEqual([
      { code: "1100", name: "Andorra", months: m(100), total: 1200 },
      { code: "2300", name: "Brookwood", months: m(200), total: 2400 },
    ]);
  });
  it("sums the rollups and keeps every suite for occupancy; is read-only", () => {
    expect(all.rollups.netOperatingIncome.total).toBe((900 + 2800) * 12);
    expect(all.tenantRevenue).toHaveLength(2);
    expect(all.consolidated?.properties.map((p) => p.code)).toEqual(["1100", "2300"]);
    expect(all.sections.flatMap((s) => s.lines).every((l) => !l.typed)).toBe(true);
  });
});

describe("a fund's roll-up puts its loan back together", () => {
  it("merges each building's share of the same loan into the one loan", () => {
    const loan = (share: number) => ({ id: "L1", lender: "Bank", ratePct: 6, interestOnly: false, maturityDate: "2030-01-01", balanceStart: 1e6, balanceEnd: 9e5, interest: 12000 * share, principal: 6000 * share, refinanceAssumed: false, share });
    const a = { ...draft("3610", "Building 1", 0, 0), debt: { loans: [loan(0.6)], interest: 7200, principal: 3600 } };
    const b = { ...draft("3620", "Building 2", 0, 0), debt: { loans: [loan(0.4)], interest: 4800, principal: 2400 } };
    const all = consolidateDrafts("All JV III", [a, b])!;
    expect(all.debt!.loans).toHaveLength(1);
    expect(all.debt!.loans[0]).toMatchObject({ interest: 12000, principal: 6000 });
    expect(all.debt!.loans[0].share).toBeUndefined();
    expect(all.debt!.interest).toBe(12000);
  });
});
