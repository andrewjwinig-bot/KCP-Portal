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

import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "cam-retail-escrow";

export type RetailEscrowField = "camEscrow" | "insEscrow" | "retEscrow";

/** Sparse per-unit escrow overrides; only changed fields are stored. */
export type RetailEscrowOverrides = Record<string, Partial<Record<RetailEscrowField, number>>>;

function storeKey(property: string, year: number): string {
  return `${property}-${year}`;
}

export async function getEscrowOverrides(property: string, year: number): Promise<RetailEscrowOverrides> {
  const data = (await getJSON(PREFIX, storeKey(property, year))) as RetailEscrowOverrides | null;
  return data ?? {};
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
  const current = await getEscrowOverrides(property, year);
  const next = { ...(current[unitRef] ?? {}) } as Record<string, number>;
  if (value === null) delete next[field];
  else next[field] = value;
  if (Object.keys(next).length === 0) delete current[unitRef];
  else current[unitRef] = next as Partial<Record<RetailEscrowField, number>>;
  await storeJSON(PREFIX, storeKey(property, year), current);
  return current;
}
