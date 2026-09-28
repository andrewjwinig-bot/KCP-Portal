// The figures keyed in the Expenses step, one document per (budget year,
// property) — the same shape as the leasing assumptions, so a building's
// budget inputs live together and a save touches one small record.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { ExpenseInput, ExpenseInputKind, PropertyExpenseInputs } from "./expenseInputs";
import { assessedTaxInput } from "./assessedTaxes";

const PREFIX = "budget-expense-inputs";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

type StoredDoc = PropertyExpenseInputs & { /** Seeds someone reset (↺) — kept cleared. */ seedCleared?: ExpenseInputKind[] };

async function readDoc(budgetYear: number, propertyCode: string): Promise<StoredDoc> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as StoredDoc | null) ?? {};
}

/** A property's keyed figures, with any SEED (`assessedTaxes.ts`) under the
 *  ones nobody has typed or reset. */
export async function getExpenseInputs(budgetYear: number, propertyCode: string): Promise<PropertyExpenseInputs> {
  const { seedCleared, ...doc } = await readDoc(budgetYear, propertyCode);
  if (!doc.ret && !seedCleared?.includes("ret")) {
    const seed = assessedTaxInput(budgetYear, propertyCode);
    if (seed) doc.ret = seed;
  }
  return doc;
}

/** Save (or clear, with `input` null) one kind's figure for one property. A
 *  clear over a seed records it, so the seed does not come straight back. */
export async function setExpenseInput(
  budgetYear: number,
  propertyCode: string,
  kind: ExpenseInputKind,
  input: ExpenseInput | null,
): Promise<PropertyExpenseInputs> {
  const doc = await readDoc(budgetYear, propertyCode);
  if (input) {
    doc[kind] = { ...input, at: new Date().toISOString() };
    doc.seedCleared = doc.seedCleared?.filter((k) => k !== kind);
  } else {
    delete doc[kind];
    if (kind === "ret" && assessedTaxInput(budgetYear, propertyCode)) doc.seedCleared = [...new Set([...(doc.seedCleared ?? []), kind])];
  }
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
  return getExpenseInputs(budgetYear, propertyCode);
}
