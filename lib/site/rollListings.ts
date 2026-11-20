// The website's Available Space listings for the properties WITHOUT a
// designed centre page, straight off the current rent roll (owner, 11/2026:
// "sync the available-space page with the vacancies from the portal … with
// most current rent roll"). Pure — the caller hands in the roll.
//
//   Neshaminy Interplex   every vacant, rentable suite in the ten buildings —
//                         the SAME `spacesFromRoll` the park's own page lists
//                         (WEBSITE_HIDDEN_UNITS respected)
//   The Office Works      each OPEN office on the plan (`planFromRoll`)
//   single-tenant retail  any vacant suite on that property's roll
//
// The vendor CMS copy these properties used to show is never listed again; a
// CMS listing of the same size only lends its photos and details.

import type { SiteListing } from "./content";
import { spacesFromRoll, type RollPropertyForSpace } from "@/lib/interplex/spaces";
import { floorplateUrl, officePlateUrl } from "./floorplate";
import { OFFICE_WORKS_CODE, isSharedSpace, planFromRoll } from "@/lib/officeWorks/offices";

export type RollUnit = { unitRef: string; occupantName: string; isVacant: boolean; sqft: number; amenity?: unknown };
export type RollProperty = { propertyCode: string; totalSqft?: number; units: RollUnit[] };

export const INTERPLEX_SLUG = "neshaminy-interplex";
export const OFFICE_WORKS_SLUG = "the-office-works-instant-offices";

/** Website property → its rent-roll code, for the properties with no designed
 *  page. Cottman Ave is one roll (8200) behind two website listings; its
 *  vacancies go to the Four Seasons listing (McDonald's is its own pad). */
export const SITE_ROLL_CODE: Record<string, string> = {
  "castor-ave-save-a-lot": "7200",
  "castor-ave-usps": "5600",
  "cottman-ave-four-seasons-diner": "8200",
  "island-ave": "1500",
  "roosevelt-blvd-k-and-g-fashion-superstore": "7300",
};

/** The park page's building ids → the name a prospect reads. */
const BUILDING_NAME = (id: string) => (/^[A-C]$/.test(id) ? `Kor Center ${id}` : `Building ${id}`);

const base = (property: string, email: string | null): Omit<SiteListing, "id" | "space" | "size"> => ({
  property, minSize: null, maxSize: null, term: "Negotiable", rentalRate: "Upon Request", rentType: null,
  spaceUse: null, condition: null, available: "Now", details: null, images: null, requestMoreInfoEmail: email,
});

export function interplexListings(props: RollProperty[], email: string | null): SiteListing[] {
  return spacesFromRoll(props as RollPropertyForSpace[])
    .sort((a, b) => a.bldg.localeCompare(b.bldg, undefined, { numeric: true }) || a.suite.localeCompare(b.suite, undefined, { numeric: true }))
    .map((s) => {
      const plate = floorplateUrl(s.unit);
      return {
        ...base(INTERPLEX_SLUG, email),
        id: `interplex-${s.unit}`,
        space: `${BUILDING_NAME(s.bldg)} · ${s.suite}`,
        size: s.sf,
        spaceUse: "Office",
        // The suite on its floor (rest greyed), the building's photo, then
        // the campus map (the park page's own).
        images: [
          ...(plate ? [{ url: plate, alt: `${BUILDING_NAME(s.bldg)} ${s.suite} on its floor plan` }] : []),
          { url: `/site/interplex/assets/b-${s.bldg}.jpg`, alt: `${BUILDING_NAME(s.bldg)}, Neshaminy Interplex` },
          { url: "/site/interplex/assets/campus-map.png", alt: "Neshaminy Interplex campus map" },
        ],
        // The space column already names the building; the floor is the news.
        details: s.floor ? [{ text: `${s.floor} floor` }] : null,
      } satisfies SiteListing;
    });
}

export function officeWorksListings(props: RollProperty[], email: string | null): SiteListing[] {
  const units = props.find((p) => p.propertyCode.toUpperCase() === OFFICE_WORKS_CODE)?.units ?? null;
  if (!units) return [];
  return planFromRoll(units).filter((o) => o.av).map((o) => ({
    ...base(OFFICE_WORKS_SLUG, email),
    id: `office-works-${o.id}`,
    space: `Private Office ${o.id}`,
    size: o.sf,
    term: o.m2m ? "Month-to-month" : "Flexible",
    rentalRate: "Inquire for pricing",
    spaceUse: "Private office (furnished, all-inclusive)",
    images: [
      // The office highlighted on the floor plan, the rest greyed.
      { url: officePlateUrl(o.id), alt: `Office ${o.id} on The Office Works floor plan` },
      { url: "/office-works/assets/p-office.jpg", alt: "A private office at The Office Works" },
    ],
    details: [
      { text: o.win ? "Window office" : "Interior office" },
      { text: `Seats up to ${o.cap} ${o.cap === 1 ? "person" : "people"}` },
      { text: "Reception, conference rooms, kitchen and internet included" },
    ],
  }));
}

export function singleTenantListings(slug: string, props: RollProperty[], email: string | null): SiteListing[] {
  const code = SITE_ROLL_CODE[slug];
  const units = props.find((p) => p.propertyCode.toUpperCase() === code)?.units ?? [];
  return units
    .filter((u) => u.isVacant && !u.amenity && u.sqft > 0 && !isSharedSpace(u.unitRef, u.occupantName || ""))
    .map((u) => ({
      ...base(slug, email),
      id: `${slug}-${u.unitRef}`,
      space: `Suite ${u.unitRef.split("-").slice(1).join("-")}`,
      size: Math.round(u.sqft),
      spaceUse: "Retail",
    }));
}

/** The CMS listing of the same space (by size) lends photos and details. */
export function withCmsCopy(live: SiteListing[], cms: SiteListing[]): SiteListing[] {
  return live.map((l) => {
    const was = l.size ? cms.find((c) => c.property === l.property && c.size === l.size) : undefined;
    if (!was) return l;
    return { ...l, images: l.images ?? was.images, details: l.details?.length ? l.details : was.details, condition: l.condition ?? was.condition };
  });
}

export const isRollProperty = (slug: string) => slug === INTERPLEX_SLUG || slug === OFFICE_WORKS_SLUG || slug in SITE_ROLL_CODE;
