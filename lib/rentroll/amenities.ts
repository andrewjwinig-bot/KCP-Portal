// In-house, non-leasable units on the rent roll that should display with a
// special label (e.g. "Training Room", "Conference Center") instead of as a
// regular tenant — or as "Vacant" when the Excel happens to leave the
// occupant cell blank.
//
// Amenities count as occupied for square-footage accounting (the space is
// in use; it just doesn't generate rent) and are excluded from the tenant
// dropdown on the public maintenance submission form so they can't be
// picked as a "tenant".
//
// Add new entries here as new amenity units come online.

export type AmenityInfo = { label: string };

export const RENT_ROLL_AMENITIES: Record<string, AmenityInfo> = {
  "3640-112": { label: "Training Room" },
  "4060-217": { label: "Conference Room" },
  "4080-201": { label: "Conference Room" },
};

/** Returns the amenity record for a unit, or null if it's a normal unit. */
export function amenityFor(unitRef: string): AmenityInfo | null {
  return RENT_ROLL_AMENITIES[unitRef] ?? null;
}
