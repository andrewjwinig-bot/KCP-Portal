// Bookable in-house rooms. The same unitRefs live in
// lib/rentroll/amenities.ts (where they get the rent-roll IN-HOUSE pill).
// Add new rooms here when more come online.

export type Room = {
  unitRef: string;
  label: string;
  propertyCode: string;
  propertyName: string;
};

export const BOOKABLE_ROOMS: Room[] = [
  { unitRef: "3640-112", label: "Training Room",   propertyCode: "3640", propertyName: "Building 4" },
  { unitRef: "4060-217", label: "Conference Room", propertyCode: "4060", propertyName: "Building 6" },
  { unitRef: "4080-201", label: "Conference Room", propertyCode: "4080", propertyName: "Building 8" },
];

export function roomByUnitRef(unitRef: string): Room | null {
  return BOOKABLE_ROOMS.find((r) => r.unitRef === unitRef) ?? null;
}
