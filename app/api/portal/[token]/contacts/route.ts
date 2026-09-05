import { NextRequest, NextResponse } from "next/server";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { getOrEmptySuiteContacts, saveSuiteContacts } from "@/lib/suites/contactsStorage";
import { newContactId, type SuiteContact } from "@/lib/suites/contacts";

// Public — tenant-facing contact management behind the signed portal link.
// Writes to the SAME per-suite contacts store the admin unit page edits, so a
// tenant's changes sync straight onto the unit's Contacts card. Tenants may add,
// edit, delete, and choose which contacts receive their statements (camRecipient).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Gate = { unitRef: string } | { error: string; status: number; pinRequired?: boolean };
async function tenantUnit(token: string, req: NextRequest): Promise<Gate> {
  const access = await checkTenantAccess(token, req);
  if (!access.ok) return { error: access.error, status: access.status, ...(access.pinRequired ? { pinRequired: true } : {}) };
  return { unitRef: access.payload.u };
}
const gateFail = (g: Extract<Gate, { error: string }>) =>
  NextResponse.json({ error: g.error, ...(g.pinRequired ? { pinRequired: true } : {}) }, { status: g.status });

const safe = (c: SuiteContact) => ({ id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone, camRecipient: !!c.camRecipient, source: c.source ?? "staff" });
const asText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** POST { name, title?, email?, phone? } → add a tenant contact, return the list. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const gate = await tenantUnit(params.token, req);
  if ("error" in gate) return gateFail(gate);
  const unitRef = gate.unitRef;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const name = asText(b.name, 200), title = asText(b.title, 200), email = asText(b.email, 200), phone = asText(b.phone, 60);
  if (!name && !email && !phone) return NextResponse.json({ error: "Add at least a name, email, or phone." }, { status: 400 });

  const rec = await getOrEmptySuiteContacts(unitRef);
  if (rec.contacts.length >= 50) return NextResponse.json({ error: "You've reached the contact limit for this suite." }, { status: 400 });
  const contact: SuiteContact = { id: newContactId(), name, title, email, phone, notes: "", camRecipient: b.camRecipient === true, source: "tenant" };
  const saved = await saveSuiteContacts(unitRef, [...rec.contacts, contact]);
  return NextResponse.json({ contacts: saved.contacts.map(safe) }, { status: 201 });
}

/** PUT { id, name?, title?, email?, phone?, camRecipient? } → edit a contact. */
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const gate = await tenantUnit(params.token, req);
  if ("error" in gate) return gateFail(gate);
  const unitRef = gate.unitRef;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const id = asText(b.id, 64);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const rec = await getOrEmptySuiteContacts(unitRef);
  const idx = rec.contacts.findIndex((c) => c.id === id);
  if (idx < 0) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const cur = rec.contacts[idx];
  const next: SuiteContact = {
    ...cur,
    name: "name" in b ? asText(b.name, 200) : cur.name,
    title: "title" in b ? asText(b.title, 200) : cur.title,
    email: "email" in b ? asText(b.email, 200) : cur.email,
    phone: "phone" in b ? asText(b.phone, 60) : cur.phone,
    camRecipient: "camRecipient" in b ? b.camRecipient === true : cur.camRecipient,
  };
  if (!next.name && !next.email && !next.phone) return NextResponse.json({ error: "A contact needs at least a name, email, or phone." }, { status: 400 });
  const contacts = [...rec.contacts];
  contacts[idx] = next;
  const saved = await saveSuiteContacts(unitRef, contacts);
  return NextResponse.json({ contacts: saved.contacts.map(safe) });
}

/** DELETE ?id= → remove a contact, return the list. */
export async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const gate = await tenantUnit(params.token, req);
  if ("error" in gate) return gateFail(gate);
  const unitRef = gate.unitRef;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const rec = await getOrEmptySuiteContacts(unitRef);
  if (!rec.contacts.some((c) => c.id === id)) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const saved = await saveSuiteContacts(unitRef, rec.contacts.filter((c) => c.id !== id));
  return NextResponse.json({ contacts: saved.contacts.map(safe) });
}
