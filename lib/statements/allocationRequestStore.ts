// Persistence for allocation requests — cheques we hold and can't apply.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { AllocationRequest } from "./remittance";

const store = createCollectionStore<AllocationRequest>({
  prefix: "tenant-statement-allocation",
  keyOf: (r) => r.id,
});

export async function saveAllocationRequest(r: AllocationRequest): Promise<void> {
  await store.set(r.id, r);
}

export async function getAllocationRequest(id: string): Promise<AllocationRequest | null> {
  return store.get(id);
}

/** Every request, newest first. */
export async function allAllocationRequests(): Promise<AllocationRequest[]> {
  const all = await store.all();
  return all.filter(Boolean).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function allocationRequestsForPeriod(period: string): Promise<AllocationRequest[]> {
  return (await allAllocationRequests()).filter((r) => r.period === period);
}

/** A unit's requests that are still waiting on the tenant. */
export async function openRequestsForUnit(unitRef: string): Promise<AllocationRequest[]> {
  const ref = unitRef.trim().toUpperCase();
  return (await allAllocationRequests()).filter(
    (r) => r.unitRef.toUpperCase() === ref && !r.answeredAt && !r.closedAt,
  );
}
