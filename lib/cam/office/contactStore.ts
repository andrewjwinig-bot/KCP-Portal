// Editable overrides for tenant billing contacts, merged over the seed.
// Stored per property (contacts aren't year-specific).

import { getJSON, storeJSON } from "@/lib/storage";
import { CONTACTS_SEED, DEFAULT_CC, type TenantContact } from "./contacts";

const PREFIX = "cam-office-contacts";

export type ContactOverrides = Record<string, Partial<TenantContact>>;

export async function getContactOverrides(property: string): Promise<ContactOverrides> {
  return ((await getJSON(PREFIX, property)) as ContactOverrides | null) ?? {};
}

/** Merge seed + overrides into the effective contact map for a property.
 *  Includes any override-only units (contacts added for tenants not in the
 *  seed). Missing CC falls back to the default. */
export function mergeContacts(property: string, overrides: ContactOverrides): Record<string, TenantContact> {
  const seed = CONTACTS_SEED[property] ?? {};
  const out: Record<string, TenantContact> = {};
  const units = new Set([...Object.keys(seed), ...Object.keys(overrides)]);
  for (const unitRef of units) {
    const base = seed[unitRef] ?? { email: "", cc: DEFAULT_CC };
    const ov = overrides[unitRef] ?? {};
    out[unitRef] = {
      email: ov.email ?? base.email,
      cc: ov.cc ?? base.cc ?? DEFAULT_CC,
    };
  }
  return out;
}

export async function saveContact(
  property: string,
  unitRef: string,
  patch: Partial<TenantContact>,
): Promise<ContactOverrides> {
  const current = await getContactOverrides(property);
  current[unitRef] = { ...(current[unitRef] ?? {}), ...patch };
  await storeJSON(PREFIX, property, current);
  return current;
}
