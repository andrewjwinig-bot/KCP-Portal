// A note on any budget line, one document per (budget year, property), keyed
// like the typed months (`section::label`). Anyone working the budget can
// leave one — "insurance quote due in November", "Greg: roof patch in the
// spring" — so the reason for a figure travels with it instead of living in
// an email thread.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

export type LineNote = { text: string; by: string; at: string };
export type LineNotes = Record<string, LineNote>;

const PREFIX = "budget-line-notes";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

export async function getLineNotes(budgetYear: number, propertyCode: string): Promise<LineNotes> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as LineNotes | null) ?? {};
}

/** Set a line's note; an empty text removes it. */
export async function setLineNote(budgetYear: number, propertyCode: string, key: string, text: string, by: string): Promise<LineNotes> {
  const doc = { ...(await getLineNotes(budgetYear, propertyCode)) };
  const t = text.trim();
  if (t) doc[key] = { text: t.slice(0, 2000), by, at: new Date().toISOString() };
  else delete doc[key];
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
  return doc;
}
