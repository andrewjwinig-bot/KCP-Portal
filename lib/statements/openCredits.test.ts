import { describe, expect, it } from "vitest";
import { agingSchedule, creditGroupOf, openCredits, planCreditApplication } from "./openCredits";
import type { StatementCharge, StatementRun, TenantStatement } from "./types";

const ch = (dateISO: string | null, amount: number, description = "Monthly Rent"): StatementCharge =>
  ({ dateISO, description, amount, category: amount < 0 ? "credit" : "rent" });
const st = (unitRef: string, charges: StatementCharge[]): TenantStatement => {
  const [propertyCode, suite] = unitRef.split("-");
  const total = charges.reduce((a, c) => a + c.amount, 0);
  return { unitRef, skylineUnitRef: unitRef, propertyCode, suite, tenantName: `T ${unitRef}`, address: [], charges, reportedBalance: total, chargeTotal: total, tiesOut: true } as TenantStatement;
};
const run = (period: string, statements: TenantStatement[]): StatementRun =>
  ({ period, published: true, publishedAt: null, createdAt: "", updatedAt: "", sources: [], statements });

describe("open credit tracker", () => {
  const oct = run("2026-10", [
    st("1100-34", [ch("2026-10-01", 900), ch(null, -586.78, "Open Credits")]),
    st("3640-300", [ch(null, -250, "Open Credits")]),
    st("4500-1", [ch("2026-10-01", 1000)]),
    st("4500-2", [ch(null, -4.99, "Open Credits")]),
  ]);
  const sep = run("2026-09", [st("1100-34", [ch(null, -586.78, "Open Credits")]), st("3640-300", [ch("2026-09-01", 50)])]);
  const aug = run("2026-08", [st("1100-34", [ch(null, -10, "Open Credits")])]);

  it("lists every credit, grouped, with how long it has sat there", () => {
    const t = openCredits(oct, [sep, aug]);
    expect(t.count).toBe(2);
    expect(t.total).toBe(836.78);
    expect(t.groups.map((g) => g.group)).toEqual(["JV III", "Shopping Centers"]);
    const shear = t.groups[1].rows[0];
    expect(shear).toMatchObject({ credit: 586.78, openCharges: 900, net: 313.22, since: "2026-08", months: 3 });
    // 3640-300 had no credit in September — the run starts this month.
    expect(t.groups[0].rows[0]).toMatchObject({ since: "2026-10", months: 1, net: -250 });
    expect(t.netCreditTotal).toBe(250);
    // Under $5 is left off, counted.
    expect(t.small).toBe(1);
  });

  it("files former occupants on their own", () => {
    expect(creditGroupOf("3640", "3640-300-FO")).toBe("Former tenants");
    expect(creditGroupOf("4060")).toBe("NI LLC");
  });

  it("applies a credit oldest first, the last charge in part, capped at the credit", () => {
    const s = st("1100-34", [ch("2026-10-01", 400), ch("2026-09-01", 300), ch(null, -500, "Open Credits")]);
    const all = planCreditApplication(s, "2026-10", null);
    expect(all.lines.map((l) => [l.idx, l.applied])).toEqual([[1, 300], [0, 200]]);
    expect(all).toMatchObject({ applied: 500, remaining: 0 });
    const one = planCreditApplication(s, "2026-10", [0]);
    expect(one).toMatchObject({ applied: 400, remaining: 100 });
    // A credit index is never a charge to apply to.
    expect(planCreditApplication(s, "2026-10", [2]).applied).toBe(0);
  });
});

describe("aging schedule", () => {
  it("ages charges by month and keeps credits in their own column", () => {
    const a = agingSchedule(run("2026-10", [
      st("1100-34", [ch("2026-10-01", 900), ch("2026-09-01", 100), ch("2026-04-01", 50), ch(null, -586.78, "Open Credits")]),
    ]));
    expect(a.rows[0].buckets).toMatchObject({ current: 900, d30: 100, d90plus: 50 });
    expect(a.total).toMatchObject({ charges: 1050, credits: 586.78, net: 463.22 });
  });
});
