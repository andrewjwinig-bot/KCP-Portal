import { NextRequest, NextResponse } from "next/server";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { listReservations } from "@/lib/reservations/storage";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { reservationMatchesTenant } from "@/lib/portal/scope";

// Public — this tenant's OWN room reservations, behind the signed portal link.
// (Submission still goes to the public /api/reservations/submit; this is history.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });

  const unit = await findRentRollUnit(access.payload.u);
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
