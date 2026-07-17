import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { listRequests } from "@/lib/maintenance/requestsStorage";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { serviceRequestMatchesTenant } from "@/lib/portal/scope";

// Public — this tenant's OWN service requests, behind the signed portal link.
// (Submission still goes to the public /api/maintenance/submit; this is history.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured." }, { status: 503 });
  const payload = await verifyTenantToken(params.token, secret);
  if (!payload) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });

  const unit = await findRentRollUnit(payload.u);
  const scope = { company: unit?.occupantName ?? "", propertyCode: payload.p, unitRef: payload.u };
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
