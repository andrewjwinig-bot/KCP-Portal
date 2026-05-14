// Tenant contact directory — small "remember who this person is" store so
// repeat maintenance submissions auto-populate. Keyed by lowercased email.
// One JSON blob per email under the "tenant-contacts" storage prefix.

import "server-only";
import { deleteJSON, getJSON, listJSON, storeJSON } from "@/lib/storage";

export type TenantContact = {
  emailKey: string;          // lowercased + trimmed; storage id
  firstName: string;
  lastName: string;
  email: string;             // as the tenant typed it
  phone: string;
  company: string;
  propertyCode: string | null;
  buildingNumber: string;
  suiteNumber: string;
  firstSeenAt: string;
  lastSeenAt: string;
  submissionCount: number;
};

const PREFIX = "tenant-contacts";

// Storage IDs only accept [a-zA-Z0-9-_] so we hash anything else out. Keeping
// it deterministic so multiple submissions land on the same record.
function emailToId(email: string): string {
  const lower = email.trim().toLowerCase();
  return lower.replace(/[^a-z0-9]+/g, "_").slice(0, 128) || "anon";
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export async function getContactByEmail(email: string): Promise<TenantContact | null> {
  const id = emailToId(email);
  return (await getJSON(PREFIX, id)) as TenantContact | null;
}

export async function listContacts(): Promise<TenantContact[]> {
  return (await listJSON(PREFIX)) as TenantContact[];
}

export async function removeContact(email: string): Promise<boolean> {
  return deleteJSON(PREFIX, emailToId(email));
}

/**
 * Upsert a tenant contact record by email. Existing fields are overwritten
 * with whatever the tenant submitted this time so the autofill stays current
 * if they change company or phone. firstSeenAt is preserved.
 */
export async function upsertContact(
  input: Omit<TenantContact, "emailKey" | "firstSeenAt" | "lastSeenAt" | "submissionCount">,
): Promise<TenantContact> {
  const id = emailToId(input.email);
  const now = new Date().toISOString();
  const existing = (await getJSON(PREFIX, id)) as TenantContact | null;
  const next: TenantContact = {
    ...input,
    emailKey: normalizeEmailKey(input.email),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    submissionCount: (existing?.submissionCount ?? 0) + 1,
  };
  await storeJSON(PREFIX, id, next);
  return next;
}
