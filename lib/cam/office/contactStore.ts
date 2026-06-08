// Editable overrides for tenant billing contacts, merged over the seed.
// Stored per property (contacts aren't year-specific).

import { scopedMap } from "@/lib/collectionStore";
import { CONTACTS_SEED, DEFAULT_CC, type TenantContact } from "./contacts";

export type ContactOverrides = Record<string, Partial<TenantContact>>;

// One blob per unit (was a single per-property override map, read-modify-written
// on every contact edit). Legacy per-property blob migrated on first read.
const overrides = scopedMap<Partial<TenantContact>>({
  prefix: "cam-office-contacts-v2",
  legacyForScope: (property) => ({ prefix: "cam-office-contacts", id: property, extract: (b) => (b as ContactOverrides) ?? {} }),
});

export async function getContactOverrides(property: string): Promise<ContactOverrides> {
  return await overrides.forScope(property).all();
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
  const scope = overrides.forScope(property);
  const next = { ...((await scope.get(unitRef)) ?? {}), ...patch };
  await scope.set(unitRef, next);
  return await scope.all();
}
