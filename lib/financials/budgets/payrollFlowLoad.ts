// The payroll budget as the BUDGETS read it — the stored (or seeded) doc with
// each building's square footage off the rent roll, exactly as the Payroll
// Budget page shows it (`withRollSqft`), so a building's share on the page
// and in its draft cannot differ.

import "server-only";
import { getPayrollBudget } from "./payrollBudgetStore";
import { withRollSqft, type PayrollBudgetDoc } from "./payrollBudget";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";

/** Each property's rentable SF off the current rent roll. */
export async function rollSqft(): Promise<Record<string, number>> {
  const roll = await resolveCurrentRentroll().catch(() => null);
  const out: Record<string, number> = {};
  for (const p of roll?.properties ?? []) if (p.totalSqft > 0) out[p.propertyCode] = p.totalSqft;
  return out;
}

export async function payrollDocForBudgets(year: number): Promise<{ doc: PayrollBudgetDoc; seeded: boolean } | null> {
  const pb = await getPayrollBudget(year).catch(() => null);
  if (!pb?.doc) return null;
  return { doc: withRollSqft(pb.doc, await rollSqft()), seeded: pb.seeded };
}
