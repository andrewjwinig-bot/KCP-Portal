import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { officeLineRecoveries, OFFICE_PARTS } from "./lineRecovery";
import { combineGroups, type RecoveryRow } from "../recoveries";
import type { OfficeExpensePool, OfficeTenantInput } from "./types";
import { POOL_4070, TENANTS_4070_2025 } from "./seed/4070";

const pool: OfficeExpensePool = {
  propertyCode: "TEST",
  values: {
    "6250-8502": { "2020": 80, "2025": 100 },
    "6250-8502-95": { "2020": 80, "2025": 120 },
    "6370-8502": { "2020": 50, "2025": 30 },
    "6410-8502": { "2020": 200, "2025": 260 },
  },
  opexLines: [
    { glAccount: "6250-8502", label: "Cleaning", grossUpAccount: "6250-8502-95" },
    { glAccount: "6370-8502", label: "Snow Removal" },
  ],
  retAccount: "6410-8502",
  retLabel: "Real Estate Taxes",
  updatedAt: "",
};

const tenant = (o: Partial<OfficeTenantInput>): OfficeTenantInput => ({
  unitRef: "T-1", skylineUnit: "T-1-CU", suite: "1", name: "A", baseYear: 2020, grossUp: false,
  proRataPct: 50, sqft: 500, occPct: 1, recoveryPct: 1, opexEscrow: 0, retEscrow: 0, ...o,
});

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.05);
const part = (r: RecoveryRow, label: string) => r.parts.find((p) => p.label === label)?.amount ?? 0;
const addsBack = (r: RecoveryRow) => near(r.recovered + r.parts.reduce((s, p) => s + p.amount, 0), r.expense);

describe("office recoveries by line", () => {
  it("bills each line on its own against the base year, and the parts add back", () => {
    const res = reconcileBuilding(pool, [tenant({})], 2025);
    const g = officeLineRecoveries(pool, res, undefined, "Test");
    const [clean, snow] = g.lines;
    near(clean.recovered, 10); // 50% of (100 − 80)
    near(clean.pct, 0.1);
    near(part(clean, OFFICE_PARTS.base), 40);
    near(part(clean, OFFICE_PARTS.vacancy), 50);
    near(snow.recovered, 0); // fell below its base
    near(g.others[0].recovered, 30);
    for (const r of [...g.lines, ...g.others, g.opexTotal, g.grandTotal]) addsBack(r);
    near(g.opexTotal.recovered, res.totals.opexAmountDue);
    expect(g.tenants[0]).toMatchObject({ unitRef: "T-1", total: 40 });
    expect(clean.tenants).toEqual([{ unitRef: "T-1", name: "A", building: "TEST", amount: 10 }]);
  });

  it("a grossed-up lease reads its extra as a part that ADDS", () => {
    const res = reconcileBuilding(pool, [tenant({ grossUp: true })], 2025);
    const clean = officeLineRecoveries(pool, res, undefined, "Test").lines[0];
    near(clean.recovered, 20); // 50% × (120 − 80)
    near(part(clean, OFFICE_PARTS.grossUp), -10);
    addsBack(clean);
  });

  it("a stop on the TOTAL is spread over the lines that rose", () => {
    const pool2 = { ...pool, values: { ...pool.values, "6370-8502": { "2020": 50, "2025": 45 } } };
    const res = reconcileBuilding(pool2, [tenant({ aggregateBaseYear: true })], 2025);
    const g = officeLineRecoveries(pool2, res, undefined, "Test");
    near(g.lines[0].recovered, res.totals.opexAmountDue); // all on cleaning
    near(g.lines[1].recovered, 0);
  });

  it("ties to the 4070 recon: the lines add up to every tenant's amount due", () => {
    const res = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025);
    const g = officeLineRecoveries(POOL_4070, res, undefined, "Building 7");
    near(g.opexTotal.recovered, res.totals.opexAmountDue);
    near(g.others[0].recovered, res.totals.retAmountDue);
    for (const r of [...g.lines, ...g.others, g.grandTotal]) addsBack(r);
    near(g.tenants.reduce((s, t) => s + t.total, 0), res.totals.opexAmountDue + res.totals.retAmountDue);
  });

  it("combines buildings line by line and keeps them for the by-building view", () => {
    const a = officeLineRecoveries(pool, reconcileBuilding(pool, [tenant({})], 2025), undefined, "A");
    const b = { ...a, code: "B", name: "B", tenants: a.tenants.map((t) => ({ ...t, building: "B" })) };
    const c = combineGroups([a, b], "BOTH", "Both")!;
    near(c.lines[0].expense, 200);
    near(c.lines[0].recovered, 20);
    near(c.lines[0].pct, 0.1);
    near(c.grandTotal.expense, 780);
    expect(c.buildings?.map((x) => x.code)).toEqual(["TEST", "B"]);
    addsBack(c.grandTotal);
  });
});
