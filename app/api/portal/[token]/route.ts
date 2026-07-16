import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getSuiteInformation } from "@/lib/suites/informationStorage";
import { findRentRollUnit } from "@/lib/rentroll/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — portal-chrome data for the signed tenant link: their lease terms
 *  (from the current rent roll) and whether a floorplan is on file. The CAM
 *  statement itself is served by /api/statement/[token]; this fills the other
 *  portal tabs. Scoped entirely to the token's one unit. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured." }, { status: 503 });
  const payload = await verifyTenantToken(params.token, secret);
  if (!payload) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });

  const [unit, info] = await Promise.all([
    findRentRollUnit(payload.u),
    getSuiteInformation(payload.u),
  ]);

  const leaseTerms = unit && !unit.isVacant
    ? {
        sqft: unit.sqft,
        baseRent: unit.baseRent,             // per month
        grossRent: unit.grossRentTotal,      // per month (base + opex + RET + other)
        annualRent: unit.annualRent,
        annualRentPerSqft: unit.annualRentPerSqft,
        leaseFrom: unit.leaseFrom,           // "MM/DD/YYYY" | null
        leaseTo: unit.leaseTo,               // "MM/DD/YYYY" | null
        occupantName: unit.occupantName,
      }
    : null;

  const fp = info?.floorplan ?? null;
  const floorplan = fp ? { name: fp.name, contentType: fp.contentType } : null;

  return NextResponse.json({
    ok: true,
    property: payload.p,
    year: payload.y,
    kind: payload.k,
    leaseTerms,
    floorplan,
  });
}
