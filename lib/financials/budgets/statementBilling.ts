// What each tenant is billed a month TODAY, read off the monthly statements
// (the Skyline Statement report) — the ONE source for the CAM estimates
// table's "today" column. Each statement line carries its date and its kind,
// so a tenant's month is the sum of that month's rent / CAM / INS / RET / U&O
// lines (`statementMonthlyBilling`). It is the only report that splits
// Philadelphia's Other Expense into insurance and Use & Occupancy.
//
// Per tenant, the NEWEST imported statement month that carries any of their
// charges is the one read; `currentBilling` falls back to the rent roll only
// for a kind that month has no line for, and says so.

import "server-only";
import { allRuns } from "@/lib/statements/store";
import { statementMonthlyBilling, type StatementBilling } from "./statementBillingMath";

/** How many of the newest statement periods to look back through. */
const LOOKBACK = 6;

export async function statementBillingFor(code: string): Promise<Map<string, StatementBilling>> {
  const out = new Map<string, StatementBilling>();
  const want = String(code).toUpperCase();
  const runs = (await allRuns().catch(() => [])).slice(0, LOOKBACK);
  for (const run of runs) {
    for (const st of run.statements ?? []) {
      if (String(st.propertyCode).toUpperCase() !== want) continue;
      const ref = String(st.unitRef).toUpperCase();
      const b = statementMonthlyBilling(st.charges ?? []);
      if (!b.month) continue;
      const had = out.get(ref);
      if (!had || (had.month ?? "") < b.month) out.set(ref, b);
    }
  }
  return out;
}
