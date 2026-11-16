// Tenants with no email on file (owner, 11/2026: "we have no email on file for
// a lot of tenants … an export … one for harry of shopping center and
// residential tenants and one for nancy (office tenants) … a doc for them to
// populate that i can send back to import"). The unit page's Contacts are the
// ONE list every tenant email reads (`suiteRecipients`); the office
// spreadsheet seeded only the business parks, so everything else is empty.

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { currentAging } from "@/lib/statements/agingStore";
import { camRecipientEmails, emptyContact } from "./contacts";
import { getOrEmptySuiteContacts, getSuiteContactsMap, saveSuiteContacts } from "./contactsStorage";

/** Whose tenants: Harry — shopping centres and residential; Nancy — office. */
export type ContactGroup = "sc" | "office";

export function contactGroupOf(propertyCode: string): ContactGroup | null {
  const def = PROPERTY_DEFS.find((p) => p.id === propertyCode);
  if (!def) return null;
  if (def.type === "Office" || def.id === "4900") return "office";
  if (def.type === "Retail" || def.type === "Residential") return "sc";
  return null;
}

export type MissingEmailRow = {
  unitRef: string; propertyCode: string; propertyName: string; suite: string; tenantName: string;
  group: ContactGroup; sqft: number | null;
  /** What Skyline's Credit Balance Report prints for the tenant, a hint. */
  skylineContact: string | null; skylinePhone: string | null;
};

export async function tenantsWithoutEmail(group?: ContactGroup): Promise<MissingEmailRow[]> {
  const [roll, aging] = await Promise.all([resolveCurrentRentroll(), currentAging().catch(() => ({ tenants: [], coverage: {} }))]);
  const units: Omit<MissingEmailRow, "skylineContact" | "skylinePhone">[] = [];
  for (const p of roll?.properties ?? []) {
    const g = contactGroupOf(p.propertyCode);
    if (!g || (group && g !== group)) continue;
    const def = PROPERTY_DEFS.find((d) => d.id === p.propertyCode);
    for (const u of p.units ?? []) {
      const name = (u.occupantName ?? "").trim();
      if (u.isVacant || u.amenity || !name || /^vacant$/i.test(name)) continue;
      units.push({
        unitRef: u.unitRef, propertyCode: p.propertyCode, propertyName: def?.name ?? p.propertyCode,
        suite: u.unitRef.slice(p.propertyCode.length + 1) || u.unitRef, tenantName: name, group: g, sqft: u.sqft || null,
      });
    }
  }
  const seen = new Set<string>();
  for (let i = units.length - 1; i >= 0; i--) { const k = units[i].unitRef.toUpperCase(); if (seen.has(k)) units.splice(i, 1); else seen.add(k); }
  const contacts = await getSuiteContactsMap(units.map((u) => u.unitRef));
  const skyline = new Map<string, { contact: string | null; phone: string | null }>(aging.tenants.map((t) => [t.unitRef.toUpperCase(), { contact: t.contact, phone: t.phone }] as [string, { contact: string | null; phone: string | null }]));
  return units
    .filter((u) => !camRecipientEmails(contacts[u.unitRef] ?? []))
    .map((u) => {
      const s = skyline.get(u.unitRef.toUpperCase());
      return { ...u, skylineContact: s?.contact ?? null, skylinePhone: s?.phone ?? null };
    });
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

/** "a@x.com; b@y.com" → its addresses; a bad one is reported, not guessed. */
export function splitEmails(raw: string): { emails: string[]; bad: string[] } {
  const parts = String(raw ?? "").split(/[;,\s]+/).map((s) => s.trim().replace(/^mailto:/i, "")).filter(Boolean);
  return { emails: parts.filter((p) => EMAIL.test(p)), bad: parts.filter((p) => !EMAIL.test(p)) };
}

/** Add the addresses to the suite's contacts as statement recipients. Never
 *  removes or overwrites anyone already there; an address already on file is
 *  only marked a recipient. Returns how many were new. */
export async function addSuiteEmails(unitRef: string, emails: string[], name?: string | null): Promise<number> {
  const rec = await getOrEmptySuiteContacts(unitRef);
  const contacts = [...rec.contacts];
  let added = 0;
  for (const e of emails) {
    const hit = contacts.findIndex((c) => c.email.trim().toLowerCase() === e.toLowerCase());
    if (hit >= 0) { contacts[hit] = { ...contacts[hit], camRecipient: true }; continue; }
    contacts.push({ ...emptyContact(), email: e, name: (name ?? "").trim().slice(0, 120), camRecipient: true, source: "staff" });
    added++;
  }
  await saveSuiteContacts(unitRef, contacts);
  return added;
}
