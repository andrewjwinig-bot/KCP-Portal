// Tenant estimate overrides, one document per budget year + property
// (`estimateOverrides.ts`).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { seededEstimateOverrides, type EstimateOverride, type EstimateOverrides } from "./estimateOverrides";

const PREFIX = "budget-estimate-overrides";
const key = (year: number, code: string) => `${year}-${code.toUpperCase()}`;

async function stored(year: number, code: string): Promise<EstimateOverrides> {
  return ((await getJSON(PREFIX, key(year, code)).catch(() => null)) as EstimateOverrides | null) ?? {};
}

/** The stored overrides laid over the seeded ones. */
export async function getEstimateOverrides(year: number, code: string): Promise<EstimateOverrides> {
  return { ...seededEstimateOverrides(year, code), ...(await stored(year, code)) };
}

/** Set (or, with null, clear) one tenant's override. Clearing a SEEDED one
 *  stores an empty override, so the seed stays undone. */
export async function setEstimateOverride(year: number, code: string, unitRef: string, o: EstimateOverride | null): Promise<EstimateOverrides> {
  const doc = await stored(year, code);
  if (o) doc[unitRef] = o;
  else if (seededEstimateOverrides(year, code)[unitRef]) doc[unitRef] = {};
  else delete doc[unitRef];
  await storeJSON(PREFIX, key(year, code), doc);
  return doc;
}
