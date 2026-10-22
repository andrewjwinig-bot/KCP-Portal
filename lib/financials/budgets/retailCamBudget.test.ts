import { describe, it, expect } from "vitest";
import { camLineBudgetResolver, retailCamBudget, type BudgetLineRef } from "./retailCamBudget";

// Wakefern (Fresh Grocer) at 4500 — the owner's 2027 estimate worksheet.
const schedule = [
  ["6030-8502", "Maintenance Salaries", 31440, false],
  ["6120-8502", "Electric (Common)", 8532, true],
  ["6130-8502", "Water / Sewer", 1011, true],
  ["6220-8502", "Building Maintenance", 21142, false],
  ["6330-8502", "Parking Lot Cleaning", 50810, false],
  ["6350-8502", "Security", 100081, false],
  ["6360-8502", "Parking Lot Maintenance", 64513, false],
  ["6370-8502", "Snow Removal", 51290, true],
  ["6270-8502", "Trash Removal", 13548, false],
  ["6380-8502", "Landscaping", 20796, false],
  ["—", "Liability Insurance", 68587, true],
] as const;
const camSchedule = schedule.map(([glAccount, label, amount, nonControllable]) => ({
  glAccount, label, amount, nonControllable, billed: label !== "Building Maintenance",
}));

// The draft's reimbursable lines, 2027 budget / 2026 reprojection.
const lines: BudgetLineRef[] = [
  { label: "Maintenance Salaries", mask: "6030-8502", glAccounts: ["6030-8502"], total: 33132, basisTotal: 32837 },
  { label: "Electric", mask: "6120-8502", glAccounts: ["6120-8502"], total: 9228, basisTotal: 8960 },
  { label: "Water & Sewer", mask: "6130-8502", total: 1548, basisTotal: 1501 },
  { label: "Building Maintenance", mask: "6220-8502", glAccounts: ["6220-8502"], total: 25000, basisTotal: 24000,
    subLines: [{ account: "Recurring", total: 25000, basisTotal: 24000 }] },
  { label: "Parking Lot Cleaning", mask: "6330-8502", glAccounts: ["6330-8502"], total: 49436, basisTotal: 47993 },
  { label: "Parking Lot Maintenance", mask: "6360-*", glAccounts: ["6360-8502"], total: 18515, basisTotal: 26753 },
  { label: "Snow Removal", mask: "6370-8502", glAccounts: ["6370-8502"], total: 49896, basisTotal: 87165 },
  { label: "Landscaping", mask: "6380-8502,6380-8501", total: 18160, basisTotal: 19734,
    subLines: [{ account: "6380-8502", total: 18160, basisTotal: 19734 }, { account: "6380-8501", total: 900, basisTotal: 850 }] },
  { label: "Security", mask: "6350-8502", glAccounts: ["6350-8502"], total: 119721, basisTotal: 116233 },
  { label: "Trash Removal", mask: "6270-8502", glAccounts: ["6270-8502"], total: 17825, basisTotal: 17306 },
  { label: "Insurance", mask: "6510-*", total: 82000, basisTotal: 95000,
    subLines: [{ account: "Liability", total: 68972, basisTotal: 82476 }, { account: "Property", total: 13028, basisTotal: 12524 }] },
];

describe("retail CAM, line by line", () => {
  it("reproduces the Wakefern worksheet: $386,433 pool → $262,620 + $6,353 admin = $268,973", () => {
    const r = retailCamBudget({
      camSchedule, camPrs: 67.96, adminFeePct: 5,
      adminExcludedLabels: ["Liability Insurance", "Security", "Electric (Common)", "Water / Sewer"],
    }, camLineBudgetResolver(lines), { cam: 9, ins: 9 }, 3);
    expect(r.pool).toBe(386433);
    expect(r.share).toBe(262620);
    expect(r.admin).toBe(6353);
    expect(r.year).toBe(268973);
    // Each line on its own budget — none fell back to the ratio.
    expect(r.lines.every((l) => l.from !== "ratio")).toBe(true);
    expect(r.lines.find((l) => l.label === "Liability Insurance")).toMatchObject({ budget: 68972, projected: 82476, from: "liability" });
    expect(r.lines.find((l) => l.label === "Landscaping")).toMatchObject({ budget: 18160, from: "account" }); // the -8502 sub-line only
    expect(r.lines.find((l) => l.label === "Water / Sewer")).toMatchObject({ budget: 1548 });
    expect(r.lines.find((l) => l.label === "Building Maintenance")!.billed).toBe(false);
  });

  it("a line with no budget keeps the ratio and says so; the cap compounds to the budget year", () => {
    const r = retailCamBudget({
      camSchedule: [
        { glAccount: "9999-8502", label: "Mystery", amount: 1000, billed: true, nonControllable: false },
        { glAccount: "6370-8502", label: "Snow Removal", amount: 51290, billed: true, nonControllable: true },
      ],
      camPrs: 10, adminFeePct: 0, adminExcludedLabels: [],
      camCap: { priorControllable: 500, growthPct: 5 },
    }, camLineBudgetResolver(lines), { cam: 1.1, ins: 1 }, 3);
    expect(r.lines[0]).toMatchObject({ budget: 1100, from: "ratio" });
    expect(r.capAmount).toBe(579);            // 500 × 1.05³
    expect(r.capped).toBe(true);
    expect(r.pool).toBe(579 + 49896);
  });
});
