import { describe, expect, it } from "vitest";
import { negativeLines } from "./negativeLines";

const m = (v: number) => new Array(12).fill(v);
const line = (label: string, months: number[], extra: any = {}) => ({ label, mask: "", months, total: months.reduce((a, v) => a + v, 0), basisTotal: 0, source: "reproj-growth", ...extra });

describe("negative budget lines", () => {
  it("names a revenue or expense line with a negative month, sub-line or item", () => {
    const draft: any = { sections: [
      { name: "Revenues", role: "revenue", lines: [line("Rental income", m(100)), line("Miscellaneous", [...m(10).slice(1), -50])] },
      { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [
        line("Snow Removal", m(5)),
        line("Building Maintenance", m(5), { subLines: [{ account: "Recurring", months: m(5), total: 60, items: [{ account: "Recurring/Misc", months: [-1, ...m(0).slice(1)], total: -1 }] }] }),
      ] },
      { name: "Debt Service", role: "debt-service", lines: [line("Loan Proceeds", m(-1000))] },
    ] };
    expect(negativeLines(draft)).toEqual([
      { section: "Revenues", label: "Miscellaneous" },
      { section: "Reimbursable Expenses", label: "Building Maintenance" },
    ]);
  });
});
