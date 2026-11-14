// Tenant Communications — who gets them, and the record of every send.
// See `templates.ts` for the emails themselves.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { getSuiteContactsMap } from "@/lib/suites/contactsStorage";
import { INTERPLEX_BUILDINGS } from "@/lib/interplex/spaces";

/** The ten Interplex buildings plus The Office Works (4900), in the park. */
const BUILDING_LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.entries(INTERPLEX_BUILDINGS).map(([b, code]) => [code, /^[A-C]$/.test(b) ? `Kor Center ${b}` : `Building ${b}`])),
  "4900": "The Office Works",
};
export const AUDIENCE_CODES = Object.keys(BUILDING_LABEL);

export type Recipient = {
  unitRef: string;
  propertyCode: string;
  building: string;
  suite: string;
  tenant: string;
  /** Every contact on the unit page with an email, de-duped. Empty = none on file. */
  emails: string[];
};

/** Every occupied suite in the park with its contacts' emails. A tenant on
 *  more than one suite is listed once per suite (each suite's contacts get it
 *  once — the send de-dupes addresses across suites). */
export async function interplexRecipients(): Promise<Recipient[]> {
  const roll = await resolveCurrentRentroll();
  const rows: Omit<Recipient, "emails">[] = [];
  for (const p of (roll?.properties ?? []) as { propertyCode?: string; units?: { unitRef: string; occupantName?: string; isVacant?: boolean; amenity?: unknown }[] }[]) {
    const code = String(p.propertyCode ?? "").toUpperCase();
    if (!BUILDING_LABEL[code]) continue;
    for (const u of p.units ?? []) {
      if (u.isVacant || u.amenity || !u.occupantName?.trim()) continue;
      rows.push({ unitRef: u.unitRef, propertyCode: code, building: BUILDING_LABEL[code], suite: u.unitRef.split("-").slice(1).join("-"), tenant: u.occupantName.trim() });
    }
  }
  const contacts = await getSuiteContactsMap(rows.map((r) => r.unitRef));
  const order = AUDIENCE_CODES;
  return rows
    .map((r) => {
      const seen = new Set<string>();
      const emails: string[] = [];
      for (const c of contacts[r.unitRef] ?? []) {
        const e = (c.email ?? "").trim();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !seen.has(e.toLowerCase())) { seen.add(e.toLowerCase()); emails.push(e); }
      }
      return { ...r, emails };
    })
    .sort((a, b) => order.indexOf(a.propertyCode) - order.indexOf(b.propertyCode) || a.suite.localeCompare(b.suite, undefined, { numeric: true }));
}

export type SendLine = { unitRef: string; tenant: string; to: string[]; ok: boolean; messageId?: string; error?: string };

export type CommunicationSend = {
  id: string;
  templateId: string;
  subject: string;
  sentAt: string;
  sentBy: string | null;
  from: string;
  lines: SendLine[];
  testMode: boolean;
  /** Sent by Greg from Outlook to his own distribution lists (the portal
   *  only builds the draft) — recorded by "Mark as sent", no suites. */
  viaOutlook?: boolean;
};

const store = createCollectionStore<CommunicationSend>({ prefix: "tenant-communications", keyOf: (r) => r.id });

export async function recordSend(r: CommunicationSend): Promise<void> {
  try { await store.set(r.id, r); }
  catch (e) { console.error(`[communications] ${r.templateId} went to ${r.lines.length} suites but was not recorded`, e); }
}

export async function allSends(): Promise<CommunicationSend[]> {
  return (await store.all()).filter(Boolean).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export async function getSend(id: string): Promise<CommunicationSend | null> {
  return store.get(id);
}
