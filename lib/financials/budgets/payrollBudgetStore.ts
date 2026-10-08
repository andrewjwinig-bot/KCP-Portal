// The LIK Payroll budget, one document per budget year (`payrollBudget.ts`).
// PAYROLL IS DREW'S AND ALISON'S ALONE — the only route that reads or writes
// this checks `canSeePayroll` first.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { seedPayrollBudget, type PayrollBudgetDoc } from "./payrollBudget";

const PREFIX = "budget-payroll";

/** The year's payroll budget; a year never saved starts from the year before
 *  (or the 2026 workbook) and says so (`seeded`). */
export async function getPayrollBudget(year: number): Promise<{ doc: PayrollBudgetDoc; seeded: boolean }> {
  const saved = (await getJSON(PREFIX, String(year)).catch(() => null)) as PayrollBudgetDoc | null;
  if (saved?.employees) return { doc: saved, seeded: false };
  const prior = (await getJSON(PREFIX, String(year - 1)).catch(() => null)) as PayrollBudgetDoc | null;
  return { doc: seedPayrollBudget(year, prior?.employees ? prior : null), seeded: true };
}

export async function savePayrollBudget(doc: PayrollBudgetDoc): Promise<void> {
  await storeJSON(PREFIX, String(doc.year), doc);
}
