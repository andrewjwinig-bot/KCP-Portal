// THE PORTFOLIO'S GROUPS AND ITS OCCUPANCY RULE — one definition for every
// occupancy figure on the dashboard and in the Monthly Review (owner, 11/2026:
// "alisons dashboard have conflicting information? which one is right … the
// data needs to be consistent and correct"). The Portfolio Occupancy card read
// 74.2% and the Monthly Review 74.6% because each kept its own property list
// (the card had no 9000 Butler & Main) and its own rule for the common rooms.
//
// Client-safe and pure.

/** The Interplex office buildings (JV III + NI LLC). */
export const BUSINESS_PARK_CODES = new Set(["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
export const JV_III_CODES = new Set(["3610", "3620", "3640"]);
export const NI_LLC_CODES = new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
/** The shopping centres — 9000 Butler & Main included (owner). */
export const SHOPPING_CENTER_CODES = new Set(["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9000", "9200", "9510"]);
export const RESIDENTIAL_CODES = new Set(["9800", "9820", "9840", "9860"]);
export const OFFICE_WORKS_CODES = new Set(["4900"]);
export const LIK_CODES = new Set(["2000", "2010"]);

type OccUnit = { sqft?: number | null; isVacant?: boolean; amenity?: unknown };

/** Occupied / vacant SF by the RENT ROLL'S rule: a common room (Training Room,
 *  Conference Room — `amenity`) is space in use, so it counts as occupied, as
 *  the rent-roll import totals it (`parseRentRollExcel`). */
export function occupancyOf(units: OccUnit[]): { total: number; occupied: number; vacant: number } {
  let total = 0, occupied = 0, vacant = 0;
  for (const u of units) {
    const sf = u.sqft ?? 0;
    total += sf;
    if (u.isVacant && !u.amenity) vacant += sf; else occupied += sf;
  }
  return { total, occupied, vacant };
}
