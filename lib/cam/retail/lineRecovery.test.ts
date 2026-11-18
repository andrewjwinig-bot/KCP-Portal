import { describe, it, expect } from "vitest";
import { reconcileRetailBuilding } from "./compute";
import { retailLineRecoveries, RETAIL_PARTS } from "./lineRecovery";
import type { RecoveryRow } from "../recoveries";
import type { RetailExpensePool, RetailTenantInput } from "./types";
import { POOL_4500, TENANTS_4500_2025 } from "./seed/4500";
import { POOL_2300, TENANTS_2300_2025 } from "./seed/2300";
import { POOL_9510, TENANTS_9510_2025 } from "./seed/9510";

const near = (a: number, b: number, tol = 0.05) => expect(Math.abs(a - b)).toBeLessThan(tol);
const part = (r: RecoveryRow, label: string) => r.parts.find((p) => p.label === label)?.amount ?? 0;
const addsBack = (r: RecoveryRow) => near(r.recovered + r.parts.reduce((s, p) => s + p.amount, 0), r.expense);

const pool: RetailExpensePool = {
  propertyCode: "T", reconYear: 2025,
  camLines: [{ glAccount: "6370", label: "Snow", amount: 1000, nonControllable: true }, { glAccount: "6220", label: "Maint", amount: 2000 }],
  insAmount: 500, retAmount: 4000,
};
const tenant = (o: Partial<RetailTenantInput>): RetailTenantInput => ({
  unitRef: "T-1", suite: "1", name: "A", sqft: 100, occPct: 1, camPrs: 25, insPrs: 25, retPrs: 25,
  camDenom: 400, insDenom: 400, retDenom: 400, adminFeePct: 0, grossLease: false,
  camExcludedLabels: [], adminExcludedLabels: [], retDiscountPct: 0, camEscrow: 0, insEscrow: 0, retEscrow: 0, ...o,
});

describe("retail recoveries by line", () => {
  it("each line at the tenant's PRS, admin fees add, exclusions and gross leases explained", () => {
    const res = reconcileRetailBuilding(pool, [
      tenant({ adminFeePct: 10 }),
      tenant({ unitRef: "T-2", camExcludedLabels: ["Maint"] }),
      tenant({ unitRef: "T-3", grossLease: true }),
    ]);
    const g = retailLineRecoveries(pool, res, "Test");
    const [snow, maint] = g.lines;
    near(snow.recovered, 250 + 25 + 250); // T-1 share + 10% admin, T-2 share
    near(maint.recovered, 500 + 50);
    near(part(maint, RETAIL_PARTS.excluded), 500);
    near(part(maint, RETAIL_PARTS.gross), 500);
    near(part(maint, RETAIL_PARTS.admin), -50);
    near(part(maint, RETAIL_PARTS.vacancy), 500);
    for (const r of [...g.lines, ...g.others, g.opexTotal, g.grandTotal]) addsBack(r);
    near(g.opexTotal.recovered, res.totals.camDue);
  });

  for (const [code, p, ts] of [["4500", POOL_4500, TENANTS_4500_2025], ["2300", POOL_2300, TENANTS_2300_2025], ["9510", POOL_9510, TENANTS_9510_2025]] as const) {
    it(`ties to the ${code} recon: the lines add to every tenant's CAM + INS + RET due`, () => {
      const res = reconcileRetailBuilding(p, ts);
      const g = retailLineRecoveries(p, res, code);
      near(g.grandTotal.recovered, res.totals.camDue + res.totals.insDue + res.totals.retDue, 1);
      near(g.tenants.reduce((s, t) => s + t.total, 0), g.grandTotal.recovered, 1);
      for (const r of [...g.lines, ...g.others, g.grandTotal]) addsBack(r);
    });
  }
});
