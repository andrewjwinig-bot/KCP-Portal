// Server-only storage for per-suite contacts. Single-manifest pattern
// (same as Suite Information): one GET per read, one GET+PUT per mutation.
//
// Reads also consult SUITE_CONTACTS_SEED — a static list of on-record
// emails the office tracks in a spreadsheet — and use it as the
// initial value whenever the manifest has no entry for a unit. Once
// a unit gains a saved entry, the seed is no longer consulted for it.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import { emptySuiteContacts, newContactId, type SuiteContact, type SuiteContacts } from "./contacts";
import { SUITE_CONTACTS_SEED } from "./contactsSeed";

type Manifest = { suites: SuiteContacts[]; updatedAt: string };

// One blob per suite (was a single all-suites manifest, read-modify-written on
// every contact edit — concurrent edits dropped each other). Legacy manifest is
// migrated to per-suite blobs on first read.
const store = createCollectionStore<SuiteContacts>({
  prefix: "suite-contacts",
  keyOf: (s) => s.unitRef,
  legacy: { prefix: "suite-contacts-manifest", id: "all", extract: (b) => (b as Manifest)?.suites ?? [] },
});

function seededContactsFor(unitRef: string): SuiteContact[] {
  const emails = SUITE_CONTACTS_SEED[unitRef];
  if (!emails || emails.length === 0) return [];
  return emails.map((email) => ({
    id: newContactId(),
    name: "",
    title: "",
    email,
    phone: "",
    notes: "",
    // On-file emails are the billing addresses, so they default to CAM/RET
    // recipients — staff can clear the flag if a contact shouldn't be billed.
    camRecipient: true,
  }));
}

export async function getOrEmptySuiteContacts(unitRef: string): Promise<SuiteContacts> {
  const stored = await store.get(unitRef);
  if (stored) return stored;
  const seeded = seededContactsFor(unitRef);
  return seeded.length > 0
    ? { unitRef, contacts: seeded, updatedAt: new Date(0).toISOString() }
    : emptySuiteContacts(unitRef);
}

/** Batch read for many units (one list of the collection). Applies the same
 *  seed fallback per unit. */
export async function getSuiteContactsMap(unitRefs: string[]): Promise<Record<string, SuiteContact[]>> {
  const all = await store.all();
  const byUnit = new Map(all.map((s) => [s.unitRef, s.contacts]));
  const out: Record<string, SuiteContact[]> = {};
  for (const unitRef of unitRefs) {
    out[unitRef] = byUnit.get(unitRef) ?? seededContactsFor(unitRef);
  }
  return out;
}

export async function saveSuiteContacts(
  unitRef: string,
  contacts: SuiteContact[],
): Promise<SuiteContacts> {
  const next: SuiteContacts = { unitRef, contacts, updatedAt: new Date().toISOString() };
  await store.set(unitRef, next);
  return next;
}
