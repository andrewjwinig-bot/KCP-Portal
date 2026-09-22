// Typed budget months, one document per (budget year, property) — the same
// shape as the leasing assumptions and the Expenses step.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { applyEdit, type LineOverrides } from "./lineOverrides";

const PREFIX = "budget-line-overrides";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

export async function getLineOverrides(budgetYear: number, propertyCode: string): Promise<LineOverrides> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as LineOverrides | null) ?? {};
}

export async function editLineOverride(
  budgetYear: number, propertyCode: string, key: string, month: number | "all", value: number | null, by: string,
): Promise<LineOverrides> {
  const doc = applyEdit(await getLineOverrides(budgetYear, propertyCode), key, month, value, by);
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
  return doc;
}
