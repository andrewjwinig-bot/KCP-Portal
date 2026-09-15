// Persistence for partnership tax documents. A separate collection from
// `investor-k1` on purpose — see the note in taxDocs.ts.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { PropertyTaxDoc } from "./taxDocs";

const store = createCollectionStore<PropertyTaxDoc>({
  prefix: "property-tax-docs",
  keyOf: (d) => d.id,
});

export async function saveTaxDoc(d: PropertyTaxDoc): Promise<void> {
  await store.set(d.id, d);
}

export async function getTaxDoc(id: string): Promise<PropertyTaxDoc | null> {
  return store.get(id);
}

export async function removeTaxDoc(id: string): Promise<void> {
  await store.remove(id);
}

export async function allTaxDocs(): Promise<PropertyTaxDoc[]> {
  return store.all();
}

/** One partnership's documents for one year. */
export async function taxDocsFor(propertyCode: string, taxYear: number): Promise<PropertyTaxDoc[]> {
  return (await allTaxDocs()).filter((d) => d.propertyCode === propertyCode && d.taxYear === taxYear);
}

/** Years this partnership has any document for, newest first. */
export async function taxDocYearsFor(propertyCode: string): Promise<number[]> {
  const years = new Set((await allTaxDocs()).filter((d) => d.propertyCode === propertyCode).map((d) => d.taxYear));
  return [...years].sort((a, b) => b - a);
}
