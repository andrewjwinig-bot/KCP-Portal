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

import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "cam-retail-pool";

export type RetailPoolField = "insAmount";

/** Sparse property-wide pool overrides; only changed fields are stored. */
export type RetailPoolOverride = Partial<Record<RetailPoolField, number>>;

function storeKey(property: string, year: number): string {
  return `${property}-${year}`;
}

export async function getPoolOverride(property: string, year: number): Promise<RetailPoolOverride> {
  const data = (await getJSON(PREFIX, storeKey(property, year))) as RetailPoolOverride | null;
  return data ?? {};
}

/** Coerce + persist a single property-wide pool override. Pass null to clear it
 *  (revert to the seeded pool). Returns the updated override map. */
export async function savePoolOverride(
  property: string,
  year: number,
  field: RetailPoolField,
  value: number | null,
): Promise<RetailPoolOverride> {
  const current = await getPoolOverride(property, year);
  if (value === null) delete current[field];
  else current[field] = value;
  await storeJSON(PREFIX, storeKey(property, year), current);
  return current;
}
