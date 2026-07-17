import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { listReservations } from "@/lib/reservations/storage";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { reservationMatchesTenant } from "@/lib/portal/scope";

// Public — this tenant's OWN room reservations, behind the signed portal link.
// (Submission still goes to the public /api/reservations/submit; this is history.)
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
  const company = unit?.occupantName ?? "";
  const all = await listReservations();
  const mine = all.filter((v) => reservationMatchesTenant(v, { company }));
  const reservations = mine.map((v) => ({
    id: v.id,
    roomLabel: v.roomLabel,
    propertyName: v.propertyName,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    status: v.status,
    purpose: v.purpose,
    createdAt: v.createdAt,
  }));
  return NextResponse.json({ reservations });
}
