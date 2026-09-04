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

/** The published K-1s belonging to one owner — what an investor may see. */
export async function publishedK1sForOwner(ownerId: string): Promise<K1Document[]> {
  return (await allK1s())
    .filter((d) => d.published && d.ownerId === ownerId)
    .sort((a, b) => b.taxYear - a.taxYear);
}

/** Which tax years this partnership has documents for, newest first. */
export async function k1YearsFor(propertyCode: string): Promise<number[]> {
  const years = new Set((await allK1s()).filter((d) => d.propertyCode === propertyCode).map((d) => d.taxYear));
  return [...years].sort((a, b) => b - a);
}
