// What a Philadelphia tenant is billed a month for INSURANCE, read off the
// monthly statements (the Skyline Statement report). The rent roll cannot say:
// its Other Expense column is insurance and the Use & Occupancy tax in one
// figure. The statement lists each charge by its own description, so its
// INS line is the figure itself.
//
// The report is OPEN ITEMS only — a tenant who has paid shows no INS line — so
// this is the first source, not the only one: `currentBilling` falls back to
// the last reconciliation's INS escrow where no statement carries one.

import "server-only";
import { allRuns } from "@/lib/statements/store";
import { statementMonthlyBilling, type StatementBilling } from "./statementBillingMath";

/** The newest statement months to look back through for an open INS line. */
const LOOKBACK = 6;

export async function statementBillingFor(code: string): Promise<Map<string, StatementBilling>> {
  const out = new Map<string, StatementBilling>();
  const want = String(code).toUpperCase();
  const runs = (await allRuns().catch(() => [])).slice(0, LOOKBACK);
  for (const run of runs) {
    for (const st of run.statements ?? []) {
      if (String(st.propertyCode).toUpperCase() !== want) continue;
      const ref = String(st.unitRef).toUpperCase();
      if (out.get(ref)?.ins != null) continue; // a newer month already answered
      const b = statementMonthlyBilling(st.charges ?? []);
      if (b.ins != null) out.set(ref, b);
    }
  }
  return out;
}
