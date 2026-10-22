import { describe, it, expect } from "vitest";
import { buildDataset, lineMatches, type DatasetYear } from "./dataset";

const yr = (code: string, year: number, lines: [string, number][], noi: number, over: Partial<DatasetYear> = {}): DatasetYear => ({
  propertyCode: code, propertyName: `Prop ${code}`, year, throughPeriod: 12, noi, revenue: noi * 2,
  sections: [{ name: "Operating Expenses", role: "opex", lines: lines.map(([label, ytdActual]) => ({ label, ytdActual })) }],
  ...over,
});

const SALARIES = { include: ["salaries"], exclude: ["reimbursable"], roles: ["opex"] };

describe("lineMatches", () => {
  const section = { name: "Operating Expenses", role: "opex", lines: [] };
  const line = (label: string) => ({ label, ytdActual: 0 });

  it("matches on any include substring, case-insensitively", () => {
    expect(lineMatches(section, line("Management Salaries"), { include: ["salaries"] })).toBe(true);
    expect(lineMatches(section, line("LEASING SALARIES"), { include: ["salaries"] })).toBe(true);
    expect(lineMatches(section, line("Repairs"), { include: ["salaries"] })).toBe(false);
  });

  it("lets an exclude veto a match — which is how 'non-reimbursable' is expressed", () => {
    expect(lineMatches(section, line("Reimbursable Salaries"), SALARIES)).toBe(false);
    expect(lineMatches(section, line("Management Salaries"), SALARIES)).toBe(true);
  });

  it("can be restricted to a section role, so a revenue line of the same name is ignored", () => {
    const revenue = { name: "Reimbursements", role: "reimbursement", lines: [] };
    expect(lineMatches(revenue, line("Salaries Reimbursed"), { include: ["salaries"], roles: ["opex"] })).toBe(false);
  });

  it("matches nothing when no include is given, rather than everything", () => {
    // An empty filter summing every line would be a confidently wrong total.
    expect(lineMatches(section, line("Anything"), { include: [] })).toBe(false);
    expect(lineMatches(section, line("Anything"), { include: ["  "] })).toBe(false);
  });

  it("reads the SECTION name too, so a section-level label still matches", () => {
    const payroll = { name: "Payroll & Salaries", role: "opex", lines: [] };
    expect(lineMatches(payroll, line("Management"), { include: ["payroll"] })).toBe(true);
  });
});

describe("buildDataset — the table the assistant could not previously assemble", () => {
  const data = [
    yr("4500", 2024, [["Management Salaries", 50_000], ["Leasing Salaries", 25_000], ["Reimbursable Salaries", 90_000]], 500_000),
    yr("4500", 2025, [["Management Salaries", 60_000], ["Leasing Salaries", 30_000]], 600_000),
    yr("2300", 2024, [["Management Salaries", 20_000]], 200_000),
    yr("2300", 2025, [["Management Salaries", 25_000]], 250_000),
  ];

  it("gives the dollars AND the percentage of NOI, per property per year", () => {
    const ds = buildDataset(data, SALARIES);
    expect(ds.years).toEqual([2024, 2025]);
    const p4500 = ds.rows.find((r) => r.propertyCode === "4500")!;
    // 50k + 25k — the reimbursable 90k is excluded.
    expect(p4500.cells[0].amount).toBe(75_000);
    expect(p4500.cells[0].pctOfNoi).toBe(15);
    expect(p4500.cells[1].amount).toBe(90_000);
    expect(p4500.cells[1].pctOfNoi).toBe(15);
  });

  it("names every line it counted, so the total can be checked", () => {
    // "Non-reimbursable management/leasing salaries" is a phrase, not a GL
    // account — a total whose composition is invisible is uncheckable.
    const ds = buildDataset(data, SALARIES);
    expect(ds.matchedLines).toEqual(["Leasing Salaries", "Management Salaries"]);
    expect(ds.rows[0].cells[0].matched).not.toContain("Reimbursable Salaries");
  });

  it("reports NO MATCHING LINE as null, never as zero", () => {
    // $0 says the building spends nothing; null says we found no such line.
    // Printing the first when you mean the second is the whole risk here.
    const ds = buildDataset([...data, yr("9200", 2024, [["Repairs", 1_000]], 10_000)], SALARIES);
    expect(ds.unmatchedProperties).toEqual(["9200"]);
    expect(ds.rows.map((r) => r.propertyCode)).not.toContain("9200");
  });

  it("leaves a year a property has no statement for as null, not zero", () => {
    const ds = buildDataset([...data, yr("7010", 2025, [["Management Salaries", 10_000]], 100_000)], SALARIES);
    const p7010 = ds.rows.find((r) => r.propertyCode === "7010")!;
    expect(p7010.cells[0]).toMatchObject({ year: 2024, amount: null, pctOfNoi: null });
    expect(p7010.cells[1].amount).toBe(10_000);
  });

  it("refuses a percentage against a zero or negative NOI", () => {
    // A ratio against a loss is a number with no meaning; printing one is how
    // a table gets quoted back at you.
    const ds = buildDataset([
      yr("1100", 2025, [["Management Salaries", 10_000]], 0),
      yr("1500", 2025, [["Management Salaries", 10_000]], -50_000),
    ], SALARIES);
    expect(ds.rows.every((r) => r.cells[0].amount === 10_000)).toBe(true);
    expect(ds.rows.every((r) => r.cells[0].pctOfNoi === null)).toBe(true);
  });

  it("flags a comparison that is not period-aligned", () => {
    // Nine months against twelve is not a trend, and the table must say so.
    const mixed = [
      yr("4500", 2024, [["Management Salaries", 50_000]], 500_000),
      yr("4500", 2025, [["Management Salaries", 40_000]], 400_000, { throughPeriod: 9 }),
    ];
    expect(buildDataset(mixed, SALARIES).periodsAligned).toBe(false);
    expect(buildDataset(data, SALARIES).periodsAligned).toBe(true);
  });

  it("carries % of revenue too, since NOI is the volatile denominator", () => {
    const ds = buildDataset(data, SALARIES);
    expect(ds.rows.find((r) => r.propertyCode === "4500")!.cells[0].pctOfRevenue).toBe(7.5);
  });

  it("orders rows by property code so two runs read the same", () => {
    const ds = buildDataset(data, SALARIES);
    expect(ds.rows.map((r) => r.propertyCode)).toEqual(["2300", "4500"]);
  });
});
