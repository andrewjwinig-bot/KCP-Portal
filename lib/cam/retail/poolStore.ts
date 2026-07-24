// Property-wide retail pool overrides (currently the insurance pool).
//
// The insurance pool is a single property-wide figure
// (RetailExpensePool.insAmount), seeded from the workbook and allocated to
// tenants by their INS pro-rata share. At reconciliation time staff may need to
// correct it (e.g. the booked GL insurance differs from the seed) — that
// correction is PROPERTY-WIDE, so it lives here keyed by "<property>-<year>",
// not per tenant. (A genuine outparcel whose insurance is its own liability
// figure stays a per-tenant override on the unit page — see
// CamConfig.insAmountOverride — and still wins for that tenant.)
//
// Mirrors the escrow override store (escrowStore.ts) and the office
// expense-override store (office/expenseStore.ts).

import { scopedMap } from "@/lib/collectionStore";

export type RetailPoolField = "insAmount";

/** Sparse property-wide pool overrides; only changed fields are stored. */
export type RetailPoolOverride = Partial<Record<RetailPoolField, number>>;

const storeKey = (property: string, year: number): string => `${property}-${year}`;

// One blob per pool field (was a single per-property/year blob read-modify-
// written on save). Legacy per-scope blob migrated on first read.
const overrides = scopedMap<number>({
  prefix: "cam-retail-pool-v2",
  legacyForScope: (scope) => ({ prefix: "cam-retail-pool", id: scope, extract: (b) => (b as RetailPoolOverride) ?? {} }),
});

export async function getPoolOverride(property: string, year: number): Promise<RetailPoolOverride> {
  return (await overrides.forScope(storeKey(property, year)).all()) as RetailPoolOverride;
}

/** Coerce + persist a single property-wide pool override. Pass null to clear it
 *  (revert to the seeded pool). Returns the updated override map. */
export async function savePoolOverride(
  property: string,
  year: number,
  field: RetailPoolField,
  value: number | null,
): Promise<RetailPoolOverride> {
  const scope = overrides.forScope(storeKey(property, year));
  if (value === null) await scope.remove(field);
  else await scope.set(field, value);
  return (await scope.all()) as RetailPoolOverride;
}
