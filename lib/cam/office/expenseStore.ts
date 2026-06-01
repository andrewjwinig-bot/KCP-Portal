// Storage for Final Expense Summary overrides, per property+year. The pure
// merge lives in expenseSummary.ts; this module only persists edits.

import { getJSON, storeJSON } from "@/lib/storage";
import type { ExpenseOverride, ExpenseOverrides } from "./expenseSummary";

const PREFIX = "cam-office-expenses";

function storeKey(property: string, year: number): string {
  return `${property}-${year}`;
}

export async function getExpenseOverrides(property: string, year: number): Promise<ExpenseOverrides> {
  return ((await getJSON(PREFIX, storeKey(property, year))) as ExpenseOverrides | null) ?? {};
}

export async function saveExpenseField(
  property: string,
  year: number,
  account: string,
  field: keyof ExpenseOverride,
  value: number | string | null,
): Promise<ExpenseOverrides> {
  const current = await getExpenseOverrides(property, year);
  const next = { ...(current[account] ?? {}) } as Record<string, unknown>;
  if (value === null || value === "") delete next[field];
  else next[field] = value;
  if (Object.keys(next).length === 0) delete current[account];
  else current[account] = next as ExpenseOverride;
  await storeJSON(PREFIX, storeKey(property, year), current);
  return current;
}
