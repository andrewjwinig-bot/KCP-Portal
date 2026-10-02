// Vendors marked as not 1099-reportable.
//
// Deliberately NOT per-year and NOT per-entity: a utility is a corporation in
// every year and for every building that pays it, so marking PECO once is meant
// to hold. That is the point — the first pass through the register is the
// expensive one, and every year after starts from what you already decided.
//
// Keyed by the FOLDED vendor name (`foldVendor`). Two spellings that fold apart
// stay two rows here as well, which is the same conservatism the register uses:
// better a vendor you have to mark twice than a mark that silently covers a
// payee you never looked at.

import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import type { VendorExclusion } from "./exclusions";

const store = createMapStore<VendorExclusion>({ prefix: "financials-1099-exclusions" });

export async function allExclusions(): Promise<Record<string, VendorExclusion>> {
  return store.all();
}

export async function setExclusion(folded: string, value: VendorExclusion): Promise<void> {
  await store.set(folded, value);
}

export async function clearExclusion(folded: string): Promise<void> {
  await store.remove(folded);
}
