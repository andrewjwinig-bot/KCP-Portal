// Property-level FINAL expense overrides for the retail CAM/RET reconciliation
// — the retail counterpart of the office Final Expense Summary
// (lib/cam/office/expenseStore.ts).
//
// Each retail property's expense pool ships from the workbook seed
// (lib/cam/retail/seed/<code>.ts: camLines + retAmount). At reconciliation
// time staff may need to set a FINAL amount for an operating-expense line or
// the real-estate-tax pool that differs from the seed (a later GL/Avid pull,
// a true-up, etc.). Those corrections are PROPERTY-WIDE, so they live here
// keyed by "<property>-<year>" and override the seeded amounts on read; every
// tenant's CAM/RET then recomputes off the FINAL.
//
// Keyed by CAM-line LABEL (labels are unique within a pool and are what the
// exclusion math already matches on — GL accounts can be "—"), plus the
// reserved key "RET" for the real-estate-tax pool. The property INS pool stays
// in poolStore.ts / the Insurance card.

import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "cam-retail-final";

/** Reserved key for the real-estate-tax pool. */
export const RET_FINAL_KEY = "RET";

/** Sparse FINAL overrides; only changed lines are stored. */
export type RetailFinalOverrides = Record<string, number>;

function storeKey(property: string, year: number): string {
  return `${property}-${year}`;
}

export async function getFinalOverrides(property: string, year: number): Promise<RetailFinalOverrides> {
  const data = (await getJSON(PREFIX, storeKey(property, year))) as RetailFinalOverrides | null;
  return data ?? {};
}

/** Coerce + persist a single FINAL override. Pass null to clear it (revert to
 *  the seeded amount). Key is a CAM-line label or RET_FINAL_KEY. */
export async function saveFinalOverride(
  property: string,
  year: number,
  key: string,
  value: number | null,
): Promise<RetailFinalOverrides> {
  const current = await getFinalOverrides(property, year);
  if (value === null) delete current[key];
  else current[key] = value;
  await storeJSON(PREFIX, storeKey(property, year), current);
  return current;
}
