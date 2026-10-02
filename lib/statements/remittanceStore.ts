// Persistence for payment declarations — one blob per submission, so a tenant
// revising what they intend to pay never races another tenant's write.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { Remittance } from "./remittance";

const store = createCollectionStore<Remittance>({
  prefix: "tenant-statement-remittance",
  keyOf: (r) => r.id,
});

export async function saveRemittance(r: Remittance): Promise<void> {
  await store.set(r.id, r);
}

/** Every declaration, newest first. */
export async function allRemittances(): Promise<Remittance[]> {
  const all = await store.all();
  return all.filter(Boolean).sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
}

export async function remittancesForPeriod(period: string): Promise<Remittance[]> {
  return (await allRemittances()).filter((r) => r.period === period);
}

/** A tenant's own declarations, newest first — what the portal shows back. */
export async function remittancesForUnit(unitRef: string, period?: string): Promise<Remittance[]> {
  const ref = unitRef.trim().toUpperCase();
  return (await allRemittances()).filter(
    (r) => r.unitRef.toUpperCase() === ref && (!period || r.period === period),
  );
}
