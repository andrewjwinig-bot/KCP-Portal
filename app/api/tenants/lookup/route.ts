import { NextRequest, NextResponse } from "next/server";
import { getContactByEmail } from "@/lib/maintenance/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public — used by the tenant submission form to autopopulate name / phone /
// company / building / suite when the tenant retypes a known email.
//
// Always returns 200 with { contact: null } for unknown emails so the
// endpoint can't be used as an existence oracle by a casual prober. Per-IP
// rate limited to deter scraping.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOOKUPS_PER_HOUR = 30;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`tenant-lookup:${ip}`, LOOKUPS_PER_HOUR)) {
    return NextResponse.json({ contact: null });
  }
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ contact: null });
  }
  const c = await getContactByEmail(email);
  if (!c) return NextResponse.json({ contact: null });
  return NextResponse.json({
    contact: {
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      company: c.company,
      propertyCode: c.propertyCode,
      buildingNumber: c.buildingNumber,
      suiteNumber: c.suiteNumber,
    },
  });
}
