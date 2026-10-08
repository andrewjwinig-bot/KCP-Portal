// ─── SHADOW PROPERTIES — held, not managed ────────────────────────────────────
// Holdings the portal records for reference only. They are deliberately NOT in
// PROPERTY_DEFS, because everything that lists properties (dropdowns, GL
// imports, budgets, reminders, the CC coder, the tax tracker) reads that list,
// and none of it applies to land we own but do not manage (owner: "they dont
// need to appear in all our dropdowns … i just need one spot for it in the
// property info page"). Property Info shows them in its Land group and opens
// each at /properties/<id>, which renders the schedule below instead of the
// managed-property detail. Add another shadow holding here, not to data.ts.

import type { PropertyDef } from "./data";

export type LandParcel = {
  address: string;
  zip: string;
  /** Acres as the schedule carries them. Blank on a lot whose acreage is
   *  counted on the first row of its group (`sharedWith`). */
  acres?: number;
  /** The lots this row's acreage covers together, e.g. 8123–8135 Angelo Pl. */
  sharedWith?: string;
};

export type LandRegion = { label: string; parcels: LandParcel[] };

export type ShadowProperty = PropertyDef & {
  shadow: true;
  /** Where the information came from. */
  source: string;
  regions: LandRegion[];
};

export const SHADOW_PROPERTIES: ShadowProperty[] = [
  {
    // "LAND" is the entity code the Statement of Values and the beneficiary
    // map already use for this holding.
    id: "LAND",
    name: "The Korman Co Land",
    type: "Land",
    ownerEntity: "The Korman Co",
    shadow: true,
    source: "The Korman Co — Schedule of Vacant Land",
    notes: "Vacant land held by The Korman Co — not managed by KCP",
    regions: [
      {
        label: "Philadelphia",
        parcels: [
          { address: "4930 Grant Ave", zip: "19114", acres: 0.19332 },
          { address: "9640 State Road", zip: "19114", acres: 0.107438 },
          { address: "8123 Angelo Pl.", zip: "19153", acres: 1, sharedWith: "8123–8135 Angelo Pl." },
          { address: "8125 Angelo Pl.", zip: "19153" },
          { address: "8127 Angelo Pl.", zip: "19153" },
          { address: "8129 Angelo Pl.", zip: "19153" },
          { address: "8131 Angelo Pl.", zip: "19153" },
          { address: "8133 Angelo Pl.", zip: "19153" },
          { address: "8135 Angelo Pl.", zip: "19153" },
          { address: "2500 S. 82nd St.", zip: "19153", acres: 1, sharedWith: "2500–2510 S. 82nd St." },
          { address: "2502 S. 82nd St.", zip: "19153" },
          { address: "2504 S. 82nd St.", zip: "19153" },
          { address: "2506 S. 82nd St.", zip: "19153" },
          { address: "2508 S. 82nd St.", zip: "19153" },
          { address: "2510 S. 82nd St.", zip: "19153" },
        ],
      },
      {
        label: "Middletown Township — Bucks Co.",
        parcels: [
          { address: "Silveon Corp. Lot 6 (62.673 ac)", zip: "19047", acres: 62.673 },
          { address: "Silveon Corp. Lot 7 (4.80 ac)", zip: "19047", acres: 4.8 },
          { address: "Silveon Corp. Lot 6 (13.14 ac)", zip: "19047", acres: 13.14 },
          { address: "Silveon Corp. Lot 10 (2.42 ac)", zip: "19047", acres: 2.42 },
          { address: "Parkland Manor Pl. 1 Lots", zip: "19047", acres: 1 },
          { address: "Parkland Manor Pl. 2 Lot 8", zip: "19047", acres: 0.64 },
        ],
      },
      {
        label: "Whitemarsh — Montgomery Co.",
        parcels: [
          { address: "Lot 1 Broadacres Rd.", zip: "19422", acres: 16.31 },
          { address: "Lots 2, 3 Broadacres Rd.", zip: "19422", acres: 8.96 },
          { address: "Lot, Butler Pike (6.49 ac)", zip: "19422", acres: 6.49 },
          { address: "10 Tamarack Rd — Lot 7", zip: "19422", acres: 2.27 },
          { address: "12 Tamarack Rd — Lot 8", zip: "19422", acres: 2.22 },
          { address: "14 Tamarack Rd — Lot 10", zip: "19422", acres: 3.23 },
          { address: "16 Tamarack Rd — Lot 11", zip: "19422", acres: 3.5 },
          { address: "18 Tamarack Rd — Lot 12", zip: "19422", acres: 4.06 },
          { address: "20 Tamarack Rd — Lot 13", zip: "19422", acres: 2.02 },
          { address: "22 Tamarack Rd — Lot 14", zip: "19422", acres: 1.93 },
          { address: "24 Tamarack Rd — Lot 15", zip: "19422", acres: 1.91 },
          { address: "26 Tamarack Rd — Lot 16", zip: "19422", acres: 2.14 },
        ],
      },
      {
        label: "New Jersey",
        parcels: [
          { address: "1450 Erial Rd., Gloucester", zip: "08021", acres: 1.4 },
          { address: "1028 Harbor Rd., Palmyra", zip: "08065", acres: 3.61 },
          { address: "30 Blue Grass Rd., Gloucester", zip: "08021", acres: 11.8 },
          { address: "17 Lafayette Dr., Gloucester", zip: "08021", acres: 4.97 },
          { address: "College Dr & Powerline", zip: "08012", acres: 0.823 },
        ],
      },
    ],
  },
];

export const regionAcres = (r: LandRegion) => r.parcels.reduce((s, p) => s + (p.acres || 0), 0);
export const totalAcres = (s: ShadowProperty) => s.regions.reduce((t, r) => t + regionAcres(r), 0);
export const parcelCount = (s: ShadowProperty) => s.regions.reduce((t, r) => t + r.parcels.length, 0);

export function shadowProperty(id: string): ShadowProperty | undefined {
  return SHADOW_PROPERTIES.find((p) => p.id.toUpperCase() === id.toUpperCase());
}
