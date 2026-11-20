// Credit applications recorded on the Open Credit tracker — one per tenant per
// statement month (the month whose open charges it was applied against).
// A record of what to key in Skyline, not a posting.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { AppliedLine } from "./openCredits";

export type CreditApplication = {
  period: string; unitRef: string;
  lines: AppliedLine[]; applied: number; creditAtApply: number;
  by: string | null; at: string;
};

const keyOf = (period: string, unitRef: string) => `${period}:${unitRef.trim().toUpperCase()}`;

const store = createCollectionStore<CreditApplication>({
  prefix: "tenant-statement-credit-applications",
  keyOf: (a) => keyOf(a.period, a.unitRef),
});

export async function creditApplicationsFor(period: string): Promise<Record<string, CreditApplication>> {
  const all = (await store.all()).filter((a) => a && a.period === period);
  return Object.fromEntries(all.map((a) => [a.unitRef.toUpperCase(), a]));
}

export async function saveCreditApplication(a: CreditApplication): Promise<void> {
  await store.set(keyOf(a.period, a.unitRef), { ...a, unitRef: a.unitRef.trim().toUpperCase() });
}

export async function deleteCreditApplication(period: string, unitRef: string): Promise<void> {
  await store.remove(keyOf(period, unitRef));
}
