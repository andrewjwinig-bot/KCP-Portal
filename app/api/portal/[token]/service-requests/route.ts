import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getRequest, listRequests, saveRequest } from "@/lib/maintenance/requestsStorage";
import { applyPatch, newNoteId, type Note } from "@/lib/maintenance/requests";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { serviceRequestMatchesTenant, type PortalScope } from "@/lib/portal/scope";

// Public — this tenant's OWN service requests, behind the signed portal link.
// GET returns their history; POST lets them add a follow-up update to one of
// their own requests. (Initial submission still goes to /api/maintenance/submit.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function scopeFor(token: string): Promise<PortalScope | null> {
  const secret = linkSecret();
  if (!secret) return null;
  const payload = await verifyTenantToken(token, secret);
  if (!payload) return null;
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return null;
  const unit = await findRentRollUnit(payload.u);
  return { company: unit?.occupantName ?? "", propertyCode: payload.p, unitRef: payload.u };
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const scope = await scopeFor(params.token);
  if (!scope) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });

  const all = await listRequests();
  const mine = all.filter((r) => serviceRequestMatchesTenant(r, scope));
  const requests = mine.map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    categories: r.categories,
    createdAt: r.createdAt || r.submittedDate,
    completedDate: r.completedDate,
  }));
  return NextResponse.json({ requests });
}

/** POST { requestId, text } → append the tenant's follow-up note to one of THEIR
 *  OWN requests. Scoped exactly like GET, so a tenant can't post to another
 *  tenant's request (a mismatch returns 404, revealing nothing). Internal staff
 *  notes are never returned to the tenant — this is write-only for them. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const scope = await scopeFor(params.token);
  if (!scope) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });

  let body: { requestId?: unknown; text?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Please enter an update." }, { status: 400 });

  const r = await getRequest(requestId);
  if (!r || !serviceRequestMatchesTenant(r, scope)) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const who = (r.tenantName || scope.company || "Tenant").trim();
  const note: Note = {
    id: newNoteId(),
    author: "admin",
    authorName: `Tenant — ${who}`,
    text,
    createdAt: new Date().toISOString(),
  };
  const next = applyPatch(r, { notes: [...r.notes, note], updatedAt: note.createdAt });
  await saveRequest(next);
  return NextResponse.json({ ok: true });
}
