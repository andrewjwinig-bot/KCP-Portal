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
/** Insurance known from a document rather than keyed (owner), laid under
 *  anything stored. 9000 Butler & Main, 2027: no premium history yet (bought
 *  9/3/2026), so the acquisition UNDERWRITING's $10,000 a year, split as the
 *  Shopping Centers book splits its premium (2026: liability $190,003 /
 *  property $68,592 → 73 / 27) — this is the PROPERTY part; liability is the
 *  Insurance line's Liability bucket (`SEEDED_LINE_OVERRIDES`). Renews in
 *  November with the book: Jan–Oct at the underwritten rate, Nov–Dec +3%.
 *  Cross-check: the other centres budget ~$0.70/SF (7010 $52,398 on 73,209
 *  SF, 8200 $6,995 on 10,000 SF) → ~$10,500 on 15,045 SF. */
const novRenewal = (annual: number) => Array.from({ length: 12 }, (_, i) => Math.round((annual / 12) * (i >= 10 ? 1.03 : 1)));
export const BUTLER_MAIN_PROPERTY_INS = novRenewal(2700);
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const total = (m: number[]) => m.reduce((a, b) => a + b, 0);
const INSURANCE_SEEDS: Record<string, ExpenseInput> = {
  "2027-9000": {
    months: BUTLER_MAIN_PROPERTY_INS,
    note: "Underwriting $10,000/yr (property 27% · liability 73%), Nov renewal +3%",
    source: {
      pill: "Underwriting", title: "Butler & Main insurance — acquisition underwriting",
      rows: [
        { label: "Underwritten premium", value: "$10,000 / yr" },
        { label: "Property (27%) · this line", value: usd(total(BUTLER_MAIN_PROPERTY_INS)) },
        { label: "Liability (73%) · Liability bucket", value: usd(total(novRenewal(7300))) },
        { label: "Flood (policy 0006262172) · Other", value: "$3,870 Sep" },
      ],
      total: { label: "Comparable centres", value: "≈ $0.70 / SF" },
    },
  },
};

export async function getExpenseInputs(budgetYear: number, propertyCode: string): Promise<PropertyExpenseInputs> {
  const { seedCleared: _legacy, ...doc } = await readDoc(budgetYear, propertyCode);
  const ins = INSURANCE_SEEDS[idFor(budgetYear, propertyCode)];
  if (ins && !doc.insurance) doc.insurance = ins;
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
