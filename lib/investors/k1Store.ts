// Persistence for K-1 documents — one blob per document, so confirming one
// file never rewrites another.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { K1Document } from "./k1";

const store = createCollectionStore<K1Document>({
  prefix: "investor-k1",
  keyOf: (d) => d.id,
});

export async function saveK1(d: K1Document): Promise<void> {
  await store.set(d.id, d);
}

export async function getK1(id: string): Promise<K1Document | null> {
  return store.get(id);
}

export async function removeK1(id: string): Promise<void> {
  await store.remove(id);
}

export async function allK1s(): Promise<K1Document[]> {
  return (await store.all()).filter(Boolean);
}

/** Every K-1 for one partnership year, newest upload first. */
export async function k1sFor(propertyCode: string, taxYear: number): Promise<K1Document[]> {
  return (await allK1s())
    .filter((d) => d.propertyCode === propertyCode && d.taxYear === taxYear)
    .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}

/** Every K-1 held by one owner, newest year first — what staff see. */
export async function k1sForOwner(ownerId: string): Promise<K1Document[]> {
  return (await allK1s())
    .filter((d) => d.ownerId === ownerId)
    .sort((a, b) => b.taxYear - a.taxYear);
}

/**
 * What the INVESTOR may see: everything uploaded onto them, minus anything
 * deliberately withheld.
 *
 * This used to require `published`, so a K-1 stayed invisible until a send
 * released it — and a send released only the partnership it came from. An
 * investor in fifteen partnerships therefore opened their link and saw one
 * document, with fourteen uploaded, covered by the link, and hidden. The
 * uploads were the answer to "what do I have"; withholding them by default
 * answered a different question.
 *
 * Uploading is still a deliberate act onto a named owner row, and `withheld`
 * pulls a mistake straight back.
 */
export async function visibleK1sForOwner(ownerId: string): Promise<K1Document[]> {
  return (await allK1s())
    .filter((d) => d.ownerId === ownerId && !d.withheld)
    .sort((a, b) => b.taxYear - a.taxYear);
}

/** Which tax years this partnership has documents for, newest first. */
export async function k1YearsFor(propertyCode: string): Promise<number[]> {
  const years = new Set((await allK1s()).filter((d) => d.propertyCode === propertyCode).map((d) => d.taxYear));
  return [...years].sort((a, b) => b - a);
}
