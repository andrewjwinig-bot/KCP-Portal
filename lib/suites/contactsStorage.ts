// Server-only storage for per-suite contacts. Single-manifest pattern
// (same as Suite Information): one GET per read, one GET+PUT per mutation.
//
// Reads also consult SUITE_CONTACTS_SEED — a static list of on-record
// emails the office tracks in a spreadsheet — and use it as the
// initial value whenever the manifest has no entry for a unit. Once
// a unit gains a saved entry, the seed is no longer consulted for it.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptySuiteContacts, newContactId, type SuiteContact, type SuiteContacts } from "./contacts";
import { SUITE_CONTACTS_SEED } from "./contactsSeed";

const PREFIX = "suite-contacts-manifest";
const ID = "all";

type Manifest = { suites: SuiteContacts[]; updatedAt: string };

async function loadAll(): Promise<SuiteContacts[]> {
  const m = (await getJSON(PREFIX, ID)) as Manifest | null;
  return m && Array.isArray(m.suites) ? m.suites : [];
}

async function saveAll(suites: SuiteContacts[]): Promise<void> {
  await storeJSON(PREFIX, ID, { suites, updatedAt: new Date().toISOString() });
}

function seededContactsFor(unitRef: string): SuiteContact[] {
  const emails = SUITE_CONTACTS_SEED[unitRef];
  if (!emails || emails.length === 0) return [];
  return emails.map((email) => ({
    id: newContactId(),
    name: "",
    title: "",
    email,
    phone: "",
    address: "",
    notes: "",
  }));
}

export async function getOrEmptySuiteContacts(unitRef: string): Promise<SuiteContacts> {
  const all = await loadAll();
  const stored = all.find((s) => s.unitRef === unitRef);
  if (stored) return stored;
  const seeded = seededContactsFor(unitRef);
  return seeded.length > 0
    ? { unitRef, contacts: seeded, updatedAt: new Date(0).toISOString() }
    : emptySuiteContacts(unitRef);
}

export async function saveSuiteContacts(
  unitRef: string,
  contacts: SuiteContact[],
): Promise<SuiteContacts> {
  const all = await loadAll();
  const next: SuiteContacts = { unitRef, contacts, updatedAt: new Date().toISOString() };
  const idx = all.findIndex((s) => s.unitRef === unitRef);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveAll(all);
  return next;
}
