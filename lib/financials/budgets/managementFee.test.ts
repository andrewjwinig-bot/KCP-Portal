import { describe, expect, it } from "vitest";
import { applyManagementFee, grossRevenueMonths, priorFeeRates } from "./managementFee";

const m = (v: number) => new Array(12).fill(v);
const sections = () => [
  { role: "revenue", lines: [{ label: "Rental Income", mask: "4230-8501", months: m(28421), total: 0 }], subtotal: m(0), total: 0 },
  { role: "reimbursement", lines: [{ label: "Common Area Maintenance", mask: "4910-8502", months: m(7300), total: 0 }], subtotal: m(0), total: 0 },
  { role: "reimbursable-expense", lines: [{ label: "Management Fee", mask: "6610-8502", months: m(0), total: 0 }], subtotal: m(0), total: 0 },
  { role: "non-reimbursable-expense", lines: [{ label: "Management fee", mask: "6610-8501", months: m(2000), total: 24000 }, { label: "Legal", mask: "6400-8501", months: m(100), total: 1200 }], subtotal: m(2100), total: 25200 },
];

describe("management fee", () => {
  it("reads each fee account's rate off last year's budget", () => {
    const prior = { sections: [{ lines: [{ label: "Management fee", glAccount: "6610-8501", feePercent: 6, isSubtotal: false }, { label: "Rent", glAccount: "4230-8501", isSubtotal: false }] }] } as any;
    expect(priorFeeRates(prior)).toEqual([{ account: "6610-8501", pct: 6 }]);
    expect(priorFeeRates(null)).toEqual([]);
  });
  it("is the rate × TOTAL REVENUES each month, as the workbook's ROUND(E$24*0.06)", () => {
    const s = sections();
    expect(grossRevenueMonths(s as any)[0]).toBe(35721);
    const r = applyManagementFee(s as any, [{ account: "6610-8501", pct: 6 }]);
    const fee = s[3].lines[0] as any;
    expect(fee.months[0]).toBe(Math.round(35721 * 0.06)); // 2143 — the workbook's 9510 January
    expect(fee.source).toBe("fee");
    expect(fee.feePct).toBe(6);
    expect(s[3].total).toBe(2143 * 12 + 1200);
    expect(r.reimbursable).toBe(false);
    // The reimbursable line on another account is untouched.
    expect(s[2].lines[0].months[0]).toBe(0);
  });
  it("flags a recoverable fee so recoveries are re-run", () => {
    const s = sections();
    expect(applyManagementFee(s as any, [{ account: "6610-8502", pct: 4 }]).reimbursable).toBe(true);
  });
  it("leaves the line alone with no rate on file", () => {
    const s = sections();
    expect(applyManagementFee(s as any, []).applied).toBe(false);
    expect(s[3].lines[0].months[0]).toBe(2000);
  });
});
