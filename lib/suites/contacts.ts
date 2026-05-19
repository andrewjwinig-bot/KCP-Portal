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
  return { id: newContactId(), name: "", title: "", email: "", phone: "", address: "", notes: "" };
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
    };
    // Skip fully empty rows.
    if (contact.name || contact.email || contact.phone || contact.address || contact.title || contact.notes) {
      out.push(contact);
    }
  }
  return out.slice(0, 50);
}
