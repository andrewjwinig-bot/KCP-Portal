// Per-suite contact directory — tenant contacts staff keep for each
// rent-roll unit. Pure types + helpers, safe to import from client
// components. Server-only storage lives in ./contactsStorage.ts.

export type SuiteContact = {
  id: string;
  name: string;
  title: string;    // role / title — free text
  email: string;
  phone: string;
  address: string;
  notes: string;
  /** Marks this contact as a recipient of the CAM/RET reconciliation
   *  statement. The Contacts directory is the master source of truth for
   *  who gets billed; this flag picks which of a suite's contacts actually
   *  receive the statement (others may be maintenance-only, etc.). */
  camRecipient?: boolean;
};

export type SuiteContacts = {
  unitRef: string;
  contacts: SuiteContact[];
  updatedAt: string;
};

export function emptySuiteContacts(unitRef: string): SuiteContacts {
  return { unitRef, contacts: [], updatedAt: new Date().toISOString() };
}

export function newContactId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyContact(): SuiteContact {
  return { id: newContactId(), name: "", title: "", email: "", phone: "", address: "", notes: "", camRecipient: false };
}

/** The CAM/RET statement recipients for a suite: contacts explicitly flagged
 *  as recipients, falling back to every contact with an email when none is
 *  flagged (so a suite with a single on-file billing email "just works").
 *  Returns the de-duped emails joined with "; ". */
export function camRecipientEmails(contacts: SuiteContact[]): string {
  const withEmail = contacts.filter((c) => c.email.trim());
  const flagged = withEmail.filter((c) => c.camRecipient);
  const chosen = flagged.length > 0 ? flagged : withEmail;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chosen) {
    const e = c.email.trim();
    const key = e.toLowerCase();
    if (e && !seen.has(key)) { seen.add(key); out.push(e); }
  }
  return out.join("; ");
}

function asText(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Coerce an untrusted JSON body into a clean contact list.
export function sanitizeContacts(body: unknown): SuiteContact[] {
  const raw = (body as { contacts?: unknown })?.contacts;
  if (!Array.isArray(raw)) return [];
  const out: SuiteContact[] = [];
  for (const item of raw) {
    const c = (item ?? {}) as Record<string, unknown>;
    const contact: SuiteContact = {
      id: asText(c.id, 64) || newContactId(),
      name: asText(c.name, 200),
      title: asText(c.title, 200),
      email: asText(c.email, 200),
      phone: asText(c.phone, 60),
      address: asText(c.address, 400),
      notes: asText(c.notes, 1000),
      camRecipient: c.camRecipient === true,
    };
    // Skip fully empty rows.
    if (contact.name || contact.email || contact.phone || contact.address || contact.title || contact.notes) {
      out.push(contact);
    }
  }
  return out.slice(0, 50);
}
