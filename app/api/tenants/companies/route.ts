import { NextRequest, NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

// Public — used by the tenant submission form to populate the Company
// dropdown once a building is selected.
//
// Returns the distinct list of occupants currently on the rent roll for a
// given property, plus the unit assignments so the form can also offer
// suite-number autofill once a company is chosen.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type CompanyMatch = {
  name: string;
  units: { unitRef: string; sqft: number }[];
};

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("propertyCode") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "propertyCode required" }, { status: 400 });
  }

  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  if (!rentroll) {
    return NextResponse.json({ companies: [] });
  }
  const prop = rentroll.properties.find(
    (p) => p.propertyCode.toUpperCase() === code.toUpperCase(),
  );
  if (!prop) {
    return NextResponse.json({ companies: [] });
  }

  // Group units by occupant name. Skip vacancies — tenants don't claim them.
  const map = new Map<string, CompanyMatch>();
  for (const u of prop.units) {
    if (u.isVacant) continue;
    const name = u.occupantName.trim();
    if (!name) continue;
    const entry = map.get(name) ?? { name, units: [] };
    entry.units.push({ unitRef: u.unitRef, sqft: u.sqft });
    map.set(name, entry);
  }

  const companies = Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return NextResponse.json({ companies });
}
