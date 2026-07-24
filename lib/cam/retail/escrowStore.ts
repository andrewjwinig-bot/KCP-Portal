// Per-building, per-year escrow overrides for the retail CAM/INS/RET
// reconciliation.
//
// Escrow billed (CAM/INS/RET) is seeded on the rent-roll roster
// (lib/cam/retail/seed/<code>.ts) from the reconciliation workbook, but staff
// occasionally need to correct what was actually billed at recon time. Edits
// are stored as a sparse per-unit override map keyed by "<property>-<year>"
// and merged over the roster's seeded escrow on read, so the workbook values
// ship with the code and only changed fields are persisted — mirroring the
// office side (lib/cam/office/configStore.ts).

import { scopedMap } from "@/lib/collectionStore";

export type RetailEscrowField = "camEscrow" | "insEscrow" | "retEscrow";

/** Sparse per-unit escrow overrides; only changed fields are stored. */
export type RetailEscrowOverrides = Record<string, Partial<Record<RetailEscrowField, number>>>;

const storeKey = (property: string, year: number): string => `${property}-${year}`;

// One blob per unit (was a single per-property/year blob holding the whole
// override map, read-modify-written on every escrow cell edit). Legacy per-scope
// blob migrated on first read.
const overrides = scopedMap<Partial<Record<RetailEscrowField, number>>>({
  prefix: "cam-retail-escrow-v2",
  legacyForScope: (scope) => ({ prefix: "cam-retail-escrow", id: scope, extract: (b) => (b as RetailEscrowOverrides) ?? {} }),
});

export async function getEscrowOverrides(property: string, year: number): Promise<RetailEscrowOverrides> {
  return await overrides.forScope(storeKey(property, year)).all();
}

/** Coerce + persist a single unit's escrow override. Pass null to clear that
 *  field (revert to the roster-seeded escrow). Returns the updated map. */
export async function saveEscrowOverride(
  property: string,
  year: number,
  unitRef: string,
  field: RetailEscrowField,
  value: number | null,
): Promise<RetailEscrowOverrides> {
  const scope = overrides.forScope(storeKey(property, year));
  const next = { ...((await scope.get(unitRef)) ?? {}) } as Record<string, number>;
  if (value === null) delete next[field];
  else next[field] = value;
  if (Object.keys(next).length === 0) await scope.remove(unitRef);
  else await scope.set(unitRef, next as Partial<Record<RetailEscrowField, number>>);
  return await scope.all();
}
