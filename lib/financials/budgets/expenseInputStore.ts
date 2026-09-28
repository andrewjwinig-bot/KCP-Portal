// The figures keyed in the Expenses step, one document per (budget year,
// property) — the same shape as the leasing assumptions, so a building's
// budget inputs live together and a save touches one small record.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { ExpenseInput, ExpenseInputKind, PropertyExpenseInputs } from "./expenseInputs";
import { assessedTaxInput, isDeliberateOverride, withSeedComparison } from "./assessedTaxes";

const PREFIX = "budget-expense-inputs";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

type StoredDoc = PropertyExpenseInputs & { /** Seeds someone reset (↺) — kept cleared. */ seedCleared?: ExpenseInputKind[] };

async function readDoc(budgetYear: number, propertyCode: string): Promise<StoredDoc> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as StoredDoc | null) ?? {};
}

/** A property's keyed figures. Real estate taxes on a property whose tax is
 *  COMPUTED from public record (`assessedTaxes.ts`) take that figure — it is
 *  the budget's tax, not a suggestion under whatever was keyed before it
 *  existed. Only a tax typed AFTER the computation shipped
 *  (`COMPUTED_TAX_SINCE`) overrides it, and then it says by how much
 *  (`withSeedComparison`). Figures stored earlier were keyed against "this
 *  year + 3%" — 1500 and 4500 read ENTERED at the wrong figure, and a $0
 *  accepted where no tax had posted beat a real $6,014 bill. */
export async function getExpenseInputs(budgetYear: number, propertyCode: string): Promise<PropertyExpenseInputs> {
  const { seedCleared: _legacy, ...doc } = await readDoc(budgetYear, propertyCode);
  const seed = assessedTaxInput(budgetYear, propertyCode);
  if (seed) {
    const stored = doc.ret;
    doc.ret = stored && isDeliberateOverride(stored) ? withSeedComparison(stored, seed) : seed;
  }
  return doc;
}

/** Save (or clear, with `input` null) one kind's figure for one property. A
 *  clear hands a computed tax back to the computation. */
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
    doc.seedCleared = undefined;
  }
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
  return getExpenseInputs(budgetYear, propertyCode);
}
