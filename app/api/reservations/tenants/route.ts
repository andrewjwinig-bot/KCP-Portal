import { NextRequest, NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { amenityFor } from "@/lib/rentroll/amenities";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public — feeds the Tenant dropdown on /reserve. Any office tenant can
// book any conference / training room regardless of which building they
// lease in, so this returns the deduped set of occupant names across all
// Office-type properties.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Public + enumerates every office occupant, so throttle to blunt scraping.
  if (!checkRateLimit(`reservations-tenants:${getClientIp(req)}`, 40)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const OFFICE_CODES = new Set(
    PROPERTY_DEFS
      .filter((p) => p.type === "Office" && !p.entityKind)
      .map((p) => p.id.toUpperCase()),
  );

  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  if (!rentroll) return NextResponse.json({ tenants: [] });

  const names = new Set<string>();
  for (const prop of rentroll.properties) {
    if (!OFFICE_CODES.has(prop.propertyCode.toUpperCase())) continue;
    for (const u of prop.units) {
      if (u.isVacant) continue;
      if (u.amenity || amenityFor(u.unitRef)) continue;
      const name = u.occupantName.trim();
      if (name) names.add(name);
    }
  }
  const tenants = Array.from(names).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ tenants });
}
