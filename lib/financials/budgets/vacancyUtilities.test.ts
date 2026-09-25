import { describe, it, expect } from "vitest";
import { vacantSfByMonth, vacantSfToday, defaultRate, monthsAt, resolveRate, rateKey, isVacancyUtilitiesLine } from "./vacancyUtilities";
import type { RentRow } from "./leaseRevenue";

const row = (unitRef: string, sqft: number, rentFrom: number | null, status: RentRow["status"]): RentRow => ({
  unitRef, tenant: unitRef, sqft, status,
  months: Array.from({ length: 12 }, (_, i) => (rentFrom != null && i >= rentFrom ? 1000 : 0)),
  assumed: new Array(12).fill(false),
});

const rows = [
  row("A", 2000, 0, "contracted"),      // leased all year
  row("B", 1000, null, "vacant"),       // vacant all year
  row("C", 3000, 5, "lease-up"),        // leased up from June
];

describe("utilities on vacant space", () => {
  it("is the non-reimbursable Utilities line only", () => {
    expect(isVacancyUtilitiesLine("non-reimbursable-expense", "Utilities")).toBe(true);
    expect(isVacancyUtilitiesLine("reimbursable-expense", "Electric")).toBe(false);
  });
  it("counts a suite vacant in the months it pays no rent — a lease-up leaves from its start", () => {
    const sf = vacantSfByMonth(rows);
    expect(sf[0]).toBe(4000);
    expect(sf[4]).toBe(4000);
    expect(sf[5]).toBe(1000);
    expect(vacantSfToday(rows)).toBe(4000);
  });
  it("defaults the rate to this year over today's vacant SF", () => {
    expect(defaultRate(4000, 4000)).toBe(1);
    expect(defaultRate(4000, 0)).toBeNull();
  });
  it("months are vacant SF × rate ÷ 12", () => {
    const m = monthsAt(1.2, vacantSfByMonth(rows));
    expect(m[0]).toBe(400);
    expect(m[5]).toBe(100);
  });
  it("a typed rate (stored in cents) replaces the default", () => {
    const doc = { [rateKey("Non-Reimbursable Expenses", "Utilities")]: { months: [85, null, null, null, null, null, null, null, null, null, null, null] } };
    const v = resolveRate(doc, "Non-Reimbursable Expenses", "Utilities", 4000, rows)!;
    expect(v.rate).toBe(0.85);
    expect(v.rateTyped).toBe(true);
    expect(resolveRate({}, "Non-Reimbursable Expenses", "Utilities", 4000, rows)!.rate).toBe(1);
  });
});
