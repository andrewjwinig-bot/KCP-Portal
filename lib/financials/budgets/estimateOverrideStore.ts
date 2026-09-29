// Tenant estimate overrides, one document per budget year + property
// (`estimateOverrides.ts`).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { EstimateOverride, EstimateOverrides } from "./estimateOverrides";

const PREFIX = "budget-estimate-overrides";
const key = (year: number, code: string) => `${year}-${code.toUpperCase()}`;

export async function getEstimateOverrides(year: number, code: string): Promise<EstimateOverrides> {
  return ((await getJSON(PREFIX, key(year, code)).catch(() => null)) as EstimateOverrides | null) ?? {};
}

/** Set (or, with null, clear) one tenant's override. */
export async function setEstimateOverride(year: number, code: string, unitRef: string, o: EstimateOverride | null): Promise<EstimateOverrides> {
  const doc = await getEstimateOverrides(year, code);
  if (o) doc[unitRef] = o; else delete doc[unitRef];
  await storeJSON(PREFIX, key(year, code), doc);
  return doc;
}
