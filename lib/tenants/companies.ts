// Server-side rent-roll occupant lookup. Powers both the public company
// picker (/api/tenants/companies) and submission-time auto-resolution of
// the free-text Company Name to a canonical tenant.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { amenityFor } from "@/lib/rentroll/amenities";

export type CompanyMatch = {
  name: string;
  units: { unitRef: string; sqft: number }[];
};

// Distinct rent-roll occupants for a property, with their unit assignments.
// Skips vacancies and in-house amenity units — neither is a real tenant.
export async function companiesForProperty(
  propertyCode: string,
): Promise<CompanyMatch[]> {
  const code = propertyCode.trim();
  if (!code) return [];

  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  if (!rentroll) return [];

  const prop = rentroll.properties.find(
    (p) => p.propertyCode.toUpperCase() === code.toUpperCase(),
  );
  if (!prop) return [];

  const map = new Map<string, CompanyMatch>();
  for (const u of prop.units) {
    if (u.isVacant) continue;
    if (u.amenity || amenityFor(u.unitRef)) continue;
    const name = u.occupantName.trim();
    if (!name) continue;
    const entry = map.get(name) ?? { name, units: [] };
    entry.units.push({ unitRef: u.unitRef, sqft: u.sqft });
    map.set(name, entry);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
