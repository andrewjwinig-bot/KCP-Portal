// Server-only storage for per-suite contacts. Single-manifest pattern
// (same as Suite Information): one GET per read, one GET+PUT per mutation.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptySuiteContacts, type SuiteContact, type SuiteContacts } from "./contacts";

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

export async function getOrEmptySuiteContacts(unitRef: string): Promise<SuiteContacts> {
  const all = await loadAll();
  return all.find((s) => s.unitRef === unitRef) ?? emptySuiteContacts(unitRef);
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
