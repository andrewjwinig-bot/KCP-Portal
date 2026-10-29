// The LIK Payroll budget, one document per budget year (`payrollBudget.ts`).
// PAYROLL IS DREW'S AND ALISON'S ALONE — the only route that reads or writes
// this checks `canSeePayroll` first.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { seedPayrollBudget, withAutoAllowances, type PayrollBudgetDoc } from "./payrollBudget";

const PREFIX = "budget-payroll";

/** The year's payroll budget; a year never saved starts from the year before
 *  (or the 2026 workbook) and says so (`seeded`). */
export async function getPayrollBudget(year: number): Promise<{ doc: PayrollBudgetDoc; seeded: boolean }> {
  // A failed read THROWS (the route answers with an error) — read as "never
  // saved", it handed the page a seeded document, and saving that would have
  // written the seed over the real year's payroll budget.
  const saved = (await getJSON(PREFIX, String(year), { retryOnMiss: true })) as PayrollBudgetDoc | null;
  if (saved?.employees) return { doc: withAutoAllowances(saved), seeded: false };
  const prior = (await getJSON(PREFIX, String(year - 1)).catch(() => null)) as PayrollBudgetDoc | null;
  return { doc: withAutoAllowances(seedPayrollBudget(year, prior?.employees ? prior : null)), seeded: true };
}

export async function savePayrollBudget(doc: PayrollBudgetDoc): Promise<void> {
  await storeJSON(PREFIX, String(doc.year), doc);
}
