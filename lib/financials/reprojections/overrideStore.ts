// Reprojection months typed over — one document per (statement key, year), in
// the same shape as the budget draft's typed months (`lineOverrides.ts`), so
// the edit rules (a month, null hands it back) are shared rather than re-typed.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { applyEdit, type LineOverrides } from "@/lib/financials/budgets/lineOverrides";

const PREFIX = "reprojection-overrides";
const idFor = (key: string, year: number) => `${year}-${key.toUpperCase()}`;

export async function getReprojOverrides(key: string, year: number): Promise<LineOverrides> {
  return ((await getJSON(PREFIX, idFor(key, year))) as LineOverrides | null) ?? {};
}

export async function editReprojOverride(key: string, year: number, lineKey: string, month: number | "all", value: number | null, by: string): Promise<LineOverrides> {
  const doc = applyEdit(await getReprojOverrides(key, year), lineKey, month, value, by);
  await storeJSON(PREFIX, idFor(key, year), doc);
  return doc;
}
