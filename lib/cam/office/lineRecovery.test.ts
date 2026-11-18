import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { lineRecoveries, combineLineRecoveries } from "./lineRecovery";
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

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.02);

describe("line recoveries", () => {
  it("bills each line on its own against the base year, and the parts add back", () => {
    const res = reconcileBuilding(pool, [tenant({})], 2025);
    const out = lineRecoveries(pool, res);
    const [clean, snow] = out.lines;
    // 50% of (100 − 80) on cleaning; snow fell below its base → nothing.
    near(clean.recovered, 10);
    near(clean.pct, 0.1);
    near(clean.lostToBaseYears, 40);
    near(clean.lostToVacancy, 50);
    near(snow.recovered, 0);
    near(snow.lostToBaseYears, 15);
    near(out.ret.recovered, 30);
    for (const l of [...out.lines, out.ret, out.opexTotal]) {
      near(l.recovered + l.lostToBaseYears + l.lostToVacancy - l.grossUpGain, l.expense);
    }
    near(out.opexTotal.recovered, res.totals.opexAmountDue);
  });

  it("a grossed-up lease reads its extra as a gain, not a loss", () => {
    const res = reconcileBuilding(pool, [tenant({ grossUp: true })], 2025);
    const clean = lineRecoveries(pool, res).lines[0];
    near(clean.recovered, 20); // 50% × (120 − 80)
    near(clean.grossUpGain, 10); // 50% × (120 − 100)
    near(clean.recovered + clean.lostToBaseYears + clean.lostToVacancy - clean.grossUpGain, 100);
  });

  it("a stop on the TOTAL is spread over the lines that rose", () => {
    const res = reconcileBuilding(pool, [tenant({ aggregateBaseYear: true })], 2025);
    const out = lineRecoveries(pool, res);
    // Total 130 vs base 130 → nothing due; cleaning's rise is offset by snow.
    near(res.totals.opexAmountDue, 0);
    near(out.opexTotal.recovered, 0);
    const res2 = reconcileBuilding({ ...pool, values: { ...pool.values, "6370-8502": { "2020": 50, "2025": 45 } } }, [tenant({ aggregateBaseYear: true })], 2025);
    const out2 = lineRecoveries(pool, res2);
    near(out2.lines[0].recovered, res2.totals.opexAmountDue); // all on cleaning
    near(out2.lines[0].viaTotalStop, res2.totals.opexAmountDue);
  });

  it("ties to the 4070 recon: the lines add up to every tenant's amount due", () => {
    const res = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025);
    const out = lineRecoveries(POOL_4070, res);
    near(out.opexTotal.recovered, res.totals.opexAmountDue);
    near(out.ret.recovered, res.totals.retAmountDue);
    for (const l of [...out.lines, out.ret]) {
      near(l.recovered + l.lostToBaseYears + l.lostToVacancy - l.grossUpGain, l.expense);
    }
  });

  it("combines buildings line by line", () => {
    const a = lineRecoveries(pool, reconcileBuilding(pool, [tenant({})], 2025));
    const c = combineLineRecoveries([a, a], "Both")!;
    near(c.lines[0].expense, 200);
    near(c.lines[0].recovered, 20);
    near(c.lines[0].pct, 0.1);
    near(c.opexTotal.expense, 260);
  });
});
