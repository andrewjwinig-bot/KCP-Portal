import { describe, expect, it } from "vitest";
import { openArSummary } from "./openAr";
import { validateFollowups } from "./followups";
import type { StatementRun, TenantStatement, StatementCharge } from "../statements/types";

const ch = (dateISO: string, amount: number): StatementCharge => ({ dateISO, description: "Rent", amount, category: "rent" });
const st = (unitRef: string, charges: StatementCharge[]): TenantStatement => {
  const [propertyCode, suite] = unitRef.split("-");
  const total = charges.reduce((a, c) => a + c.amount, 0);
  return { unitRef, skylineUnitRef: unitRef, propertyCode, suite, tenantName: `T ${unitRef}`, address: [], charges, reportedBalance: total, chargeTotal: total, tiesOut: true } as TenantStatement;
};
const run = (statements: TenantStatement[]): StatementRun => ({ period: "2026-10", published: true, publishedAt: null, createdAt: "", updatedAt: "", sources: [], statements });

describe("open A/R for the assistant", () => {
  const r = run([
    st("4500-1", [ch("2026-10-01", 1000), ch("2026-09-01", 500), ch("2026-05-01", 200)]),
    st("4500-2", [ch("2026-10-01", 300)]),
    st("4060-100", [ch("2026-08-01", 800)]),
    st("2010-1", [ch("2026-01-01", 9999)]),
  ]);

  it("totals open and past due in code, management company out", () => {
    const s = openArSummary(r);
    expect(s.tenantsOnStatement).toBe(3);
    expect(s.totalOpenAr).toBe(2800);
    expect(s.totalPastDue).toBe(1500);
    expect(s.totalOver90).toBe(200);
    expect(s.tenantsPastDue).toBe(2);
    expect(s.topTenants[0].unitRef).toBe("4060-100");
  });

  it("groups by property type with share of past due", () => {
    const s = openArSummary(r, { groupBy: "property_type" });
    const retail = s.byGroup.find((g) => g.group === "Retail")!;
    expect(retail.pastDue).toBe(700);
    expect(retail.shareOfPastDuePct).toBe(46.7);
  });

  it("limits to a property and to past-due tenants", () => {
    const s = openArSummary(r, { property: "4500", pastDueOnly: true });
    expect(s.topTenants.map((t) => t.unitRef)).toEqual(["4500-1"]);
  });
});

describe("follow-up suggestions", () => {
  it("dedupes, drops the question just asked and caps at three", () => {
    expect(validateFollowups(["Chart it by year", "chart it by year", "Same for retail?", "hi", "What about 2025?", "Which tenants drive it?"], "same for retail?"))
      .toEqual(["Chart it by year", "What about 2025?", "Which tenants drive it?"]);
    expect(validateFollowups("nope")).toEqual([]);
  });
});
