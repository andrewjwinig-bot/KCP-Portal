// Editable overrides for owner contact info (mailing address, email, notes).
// The static seed lives in ownerContacts.ts; this overlays it so Harry / Alison
// / Drew can correct or add a beneficiary's send-to details without a code
// change. Keyed by the normalized Statement-of-Values beneficiary name.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "ownership-contacts";
const ID = "current";

export interface OwnerContactOverride {
  /** Display name (optional — defaults to the seed / beneficiary name). */
  name?: string;
  address?: string;
  email?: string;
  notes?: string;
}

export type OwnerContactOverrides = Record<string, OwnerContactOverride>;

export function normContactKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function getContactOverrides(): Promise<OwnerContactOverrides> {
  return ((await getJSON(PREFIX, ID, { retryOnMiss: true })) as OwnerContactOverrides | null) ?? {};
}

/** Upsert (or clear, when `override` is null) one beneficiary's contact
 *  override. Empty-string fields are dropped so they fall back to the seed. */
export async function saveContactOverride(key: string, override: OwnerContactOverride | null): Promise<OwnerContactOverrides> {
  const map = await getContactOverrides();
  const k = normContactKey(key);
  if (override === null) {
    delete map[k];
  } else {
    const clean: OwnerContactOverride = {};
    for (const f of ["name", "address", "email", "notes"] as const) {
      const v = (override[f] ?? "").toString().trim();
      if (v) clean[f] = v;
    }
    if (Object.keys(clean).length === 0) delete map[k];
    else map[k] = clean;
  }
  await storeJSON(PREFIX, ID, map);
  return map;
}
