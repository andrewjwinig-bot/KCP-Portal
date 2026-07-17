import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getSuiteInformation } from "@/lib/suites/informationStorage";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { statementYearsForUnit } from "@/lib/cam/statementYears";
import { PROPERTY_DEFS } from "@/lib/properties/data";

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

  const [unit, info, contactsRec] = await Promise.all([
    findRentRollUnit(payload.u),
    getSuiteInformation(payload.u),
    getOrEmptySuiteContacts(payload.u),
  ]);
  // Tenant-safe contact projection — no internal notes / billing flags.
  const contacts = contactsRec.contacts.map((c) => ({
    id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone, camRecipient: !!c.camRecipient, source: c.source ?? "staff",
  }));

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

  // Tenant-safe building facts for the portal overview (no internal EIN/fund).
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === payload.p.toUpperCase());
  const building = def
    ? {
        code: def.id,
        name: def.name,
        address: def.address ?? null,
        city: def.city ?? null,
        state: def.state ?? null,
        zip: def.zip ?? null,
        type: def.type ?? null,
        yearBuilt: def.yearBuilt ?? null,
        sqft: def.sqft ?? null,
      }
    : null;

  // Years this unit has a statement for (newest first). Always include the
  // token's own year so the current statement is never missing from the list.
  const years = statementYearsForUnit(payload.k, payload.p, payload.u);
  const statementYears = years.includes(payload.y) ? years : [payload.y, ...years].sort((a, b) => b - a);

  return NextResponse.json({
    ok: true,
    property: payload.p,
    year: payload.y,
    kind: payload.k,
    building,
    leaseTerms,
    floorplan,
    statementYears,
    contacts,
  });
}
