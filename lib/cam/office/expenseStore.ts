// Storage for Final Expense Summary overrides, per property+year. The pure
// merge lives in expenseSummary.ts; this module only persists edits.

import { scopedMap } from "@/lib/collectionStore";
import type { ExpenseOverride, ExpenseOverrides } from "./expenseSummary";

const storeKey = (property: string, year: number): string => `${property}-${year}`;

// One blob per account (was a single per-property/year override map, read-modify-
// written on every Final Expense Summary cell edit). Legacy per-scope blob
// migrated on first read.
const overrides = scopedMap<ExpenseOverride>({
  prefix: "cam-office-expenses-v2",
  legacyForScope: (scope) => ({ prefix: "cam-office-expenses", id: scope, extract: (b) => (b as ExpenseOverrides) ?? {} }),
});

export async function getExpenseOverrides(property: string, year: number): Promise<ExpenseOverrides> {
  return await overrides.forScope(storeKey(property, year)).all();
}

export async function saveExpenseField(
  property: string,
  year: number,
  account: string,
  field: keyof ExpenseOverride,
  value: number | string | null,
): Promise<ExpenseOverrides> {
  const scope = overrides.forScope(storeKey(property, year));
  const next = { ...((await scope.get(account)) ?? {}) } as Record<string, unknown>;
  if (value === null || value === "") delete next[field];
  else next[field] = value;
  if (Object.keys(next).length === 0) await scope.remove(account);
  else await scope.set(account, next as ExpenseOverride);
  return await scope.all();
}
