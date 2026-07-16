import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getOrEmptySuiteContacts, saveSuiteContacts } from "@/lib/suites/contactsStorage";
import { newContactId, type SuiteContact } from "@/lib/suites/contacts";

// Public — tenant-facing contact management behind the signed portal link.
// Writes to the SAME per-suite contacts store the admin unit page edits, so a
// tenant's additions sync straight onto the unit's Contacts card. Tenants may
// only remove contacts they themselves added (source === "tenant"); staff /
// billing contacts are read-only to them.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenantUnit(token: string): Promise<string | null> {
  const secret = linkSecret();
  if (!secret) return null;
  const payload = await verifyTenantToken(token, secret);
  if (!payload) return null;
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return null;
  return payload.u;
}

const safe = (c: SuiteContact) => ({ id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone, source: c.source ?? "staff" });
const asText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** POST { name, title?, email?, phone? } → add a tenant contact, return the list. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const unitRef = await tenantUnit(params.token);
  if (!unitRef) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const name = asText(b.name, 200), title = asText(b.title, 200), email = asText(b.email, 200), phone = asText(b.phone, 60);
  if (!name && !email && !phone) return NextResponse.json({ error: "Add at least a name, email, or phone." }, { status: 400 });

  const rec = await getOrEmptySuiteContacts(unitRef);
  if (rec.contacts.length >= 50) return NextResponse.json({ error: "You've reached the contact limit for this suite." }, { status: 400 });
  const contact: SuiteContact = { id: newContactId(), name, title, email, phone, notes: "", camRecipient: false, source: "tenant" };
  const saved = await saveSuiteContacts(unitRef, [...rec.contacts, contact]);
  return NextResponse.json({ contacts: saved.contacts.map(safe) }, { status: 201 });
}

/** DELETE ?id= → remove a tenant-added contact, return the list. */
export async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const unitRef = await tenantUnit(params.token);
  if (!unitRef) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const rec = await getOrEmptySuiteContacts(unitRef);
  const target = rec.contacts.find((c) => c.id === id);
  if (!target || target.source !== "tenant") {
    return NextResponse.json({ error: "This contact can only be removed by property staff." }, { status: 403 });
  }
  const saved = await saveSuiteContacts(unitRef, rec.contacts.filter((c) => c.id !== id));
  return NextResponse.json({ contacts: saved.contacts.map(safe) });
}
