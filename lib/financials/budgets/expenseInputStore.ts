// The figures keyed in the Expenses step, one document per (budget year,
// property) — the same shape as the leasing assumptions, so a building's
// budget inputs live together and a save touches one small record.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { ExpenseInput, ExpenseInputKind, PropertyExpenseInputs } from "./expenseInputs";

const PREFIX = "budget-expense-inputs";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

export async function getExpenseInputs(budgetYear: number, propertyCode: string): Promise<PropertyExpenseInputs> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as PropertyExpenseInputs | null) ?? {};
}

/** Save (or clear, with `input` null) one kind's figure for one property. */
export async function setExpenseInput(
  budgetYear: number,
  propertyCode: string,
  kind: ExpenseInputKind,
  input: ExpenseInput | null,
): Promise<PropertyExpenseInputs> {
  const doc = await getExpenseInputs(budgetYear, propertyCode);
  if (input) doc[kind] = { ...input, at: new Date().toISOString() };
  else delete doc[kind];
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
  return doc;
}
