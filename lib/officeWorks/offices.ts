// The Office Works website's "Pick your office" grid, from the 4900 rent roll
// (client-safe, pure — the render reads the roll and passes its units in).
//
// The design handed off a fixed list of five open offices; the page now lists
// whatever is VACANT on the Office Works roll, at the roll's SF, so an office
// that leases drops off and one that frees up appears with no edit. The
// handoff's list is used only when no 4900 roll is reachable.

export const OFFICE_WORKS_CODE = "4900";

export type Office = { id: string; sf: number; m2m?: boolean };
export type RollUnitLite = { unitRef: string; occupantName: string; isVacant: boolean; sqft: number; amenity?: unknown };

/** The design's list (CityFeet, 2026) — the fallback with no roll. */
export const HANDOFF_OFFICES: Office[] = [
  { id: "5-019", sf: 199, m2m: true }, { id: "5-026", sf: 130, m2m: true }, { id: "5-027", sf: 141 },
  { id: "5-028", sf: 141, m2m: true }, { id: "5-032", sf: 141 },
];

/** Offices the design marks as offered month-to-month, by digits ("5019"). */
const MONTH_TO_MONTH = new Set(HANDOFF_OFFICES.filter((o) => o.m2m).map((o) => digitsOf(o.id)));

function digitsOf(s: string): string {
  return s.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** The suite part of a unit ref, written the way the page names an office:
 *  Building Five's "5019" / "5-019" → "5-019"; anything else as the roll has it. */
export function officeLabel(unitRef: string): string {
  const suite = unitRef.split("-").slice(1).join("-").trim();
  const m = /^5-?0*(\d{1,3})$/.exec(suite);
  return m ? `5-${m[1].padStart(3, "0")}` : suite;
}

/** Shared space the suite carries on its roll — reception, conference rooms,
 *  the lounge, kitchen, mailroom — is never an office to rent (owner: "ignore
 *  the reception area, conference rooms etc just show vacant"). */
const SHARED_SPACE = /recep|confer|\bconf\b|meeting|board ?room|lobby|lounge|kitchen|caf[eé]|break|mail|copy|print|storage|file|closet|restroom|toilet|common|corridor|hall|server|phone|admin|staff|secretar|front desk|amenit/i;

/** An office the page can offer: an area, not an amenity or shared space,
 *  and a numbered suite ("5019"), not a named room ("CONF"). */
export function isRentableOffice(u: RollUnitLite): boolean {
  const suite = u.unitRef.split("-").slice(1).join("-");
  return !u.amenity && u.sqft > 0 && /\d/.test(suite)
    && !SHARED_SPACE.test(suite) && !SHARED_SPACE.test(u.occupantName || "");
}

/** Open offices on the roll: vacant rentable offices — smallest number
 *  first. Empty when nothing is open (the page says so). */
export function officesFromRoll(units: RollUnitLite[]): Office[] {
  return units
    .filter((u) => u.isVacant && isRentableOffice(u))
    .map((u) => {
      const id = officeLabel(u.unitRef);
      return { id, sf: Math.round(u.sqft), ...(MONTH_TO_MONTH.has(digitsOf(id)) ? { m2m: true } : {}) };
    })
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

/** "130–460 SF" over every office on the roll, leased or not. */
export function sizeRange(units: RollUnitLite[], fallback = "130–460"): string {
  const sf = units.filter(isRentableOffice).map((u) => Math.round(u.sqft));
  if (!sf.length) return fallback;
  const lo = Math.min(...sf), hi = Math.max(...sf);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}
