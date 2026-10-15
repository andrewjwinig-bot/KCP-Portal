// Public shopping-center marketing pages — per-center "leasing profile".
//
// The LIVE tenant roster (occupied tenants + SF + vacancies) syncs from the
// rent roll (see lib/centers/data.ts). Everything a rent roll does NOT carry —
// marketing copy, tenant category labels, neighborhood story, driving
// distances, the leasing contact, and the marketed availabilities with their
// leasing blurbs — lives here, maintained by the leasing team. This is the
// counterpart to lib/properties/data.ts (facts) but scoped to the 5 shopping
// centers that get a public page.
//
// Design + data contract: design_handoff (Claude Design) for Gray's Ferry.
// Accent, type (Archivo / JetBrains Mono) and copy are final-intent there.

import { PROPERTY_DEFS } from "@/lib/properties/data";

export type MarketedSpace = {
  /** Display suite/label, e.g. "Suite 108", "Pad B". */
  suite: string;
  sf: number;
  /** "Inline retail" | "Freestanding pad" | … */
  kind: string;
  /** e.g. "42 ft frontage" | "Drive-thru capable". */
  frontage: string;
  /** Marketing description (the bold headline line on the dark band). */
  notes: string;
};

export type NeighborhoodCard = {
  /** Caption describing the photo needed (shown until a real photo is set). */
  img: string;
  /** Public path to a real photo, if supplied. */
  photo?: string;
  title: string;
  body: string;
};

export type Kv = { k: string; v: string };

export type LeasingContact = {
  name: string;
  company: string;
  phone: string;      // display, e.g. "(215) 350-5933"
  phoneHref: string;  // tel: value, e.g. "+12153505933"
  email: string;
  site: string;       // display, e.g. "kormancommercial.com"
};

export type CenterProfile = {
  code: string;          // property code, e.g. "4500"
  slug: string;          // URL slug, e.g. "grays-ferry"
  name: string;          // "Grays Ferry Shopping Center"
  /** Two-line H1: [line1, line2]. */
  h1: [string, string];
  /** Render the H1 as a single line (the two parts joined) at a smaller,
   *  responsive size, instead of the stacked two-line treatment. */
  heroOneLine?: boolean;
  addressLine: string;   // "2897 Grays Ferry Ave, Philadelphia, PA"
  streetAddress: string; // JSON-LD streetAddress, "2897 Grays Ferry Avenue"
  city: string;
  state: string;
  zip?: string;
  gla: number;
  anchorName: string;    // "Fresh Grocer"
  heroSub: string;
  overview: string;
  keyTenants: string;    // comma-separated marquee list
  parking: string;       // "300+ surface spaces"
  parkingShort: string;  // "300+"
  /** Extra facts appended after GLA / Anchor / Occupancy / Parking. */
  extraFacts: Kv[];
  location: { heading: string; blurb: string; access: Kv[] };
  neighborhood: NeighborhoodCard[];
  availableBlurb: string;
  /** Leasing-managed availabilities (with marketing copy). */
  marketedSpaces: MarketedSpace[];
  /** Tenant category labels, keyed by a normalized tenant name. */
  categories: Record<string, string>;
  /** Public display names, keyed by a normalized rent-roll name. The roster
   *  still syncs from the roll; this only prettifies operational names
   *  (e.g. "PLCB" → "Fine Wine & Good Spirits") for the public page. */
  displayNames?: Record<string, string>;
  contact: LeasingContact;
  geo?: { lat: number; lng: number };
  seo: {
    title: string;
    description: string;
    keywords: string;
    ogTitle: string;
    ogDescription: string;
  };
  /** Public asset paths (striped placeholders render until these exist). */
  assets: { hero?: string; sitePlan?: string };
  /** Accent color token (every CTA fill + link hover). */
  accent: string;
  /** Suite label on the dark "Available now" band. */
  accentOnDark: string;
  /** Whether per-tenant SF shows publicly in the roster. */
  showSquareFootage: boolean;
};

/** Normalize a tenant name for category lookup (lowercase, alnum only). */
export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Display src for a center image. Uploaded images live in the PRIVATE Blob
 *  store, whose URLs a browser can't load directly, so route them through the
 *  public /api/center-image proxy. Static/registry defaults (e.g. /images/…)
 *  and any non-blob URL are returned unchanged. Safe on client + server. */
export function centerImageSrc(url?: string): string | undefined {
  if (!url) return url;
  if (/^https?:\/\/[^/]*blob\.vercel-storage\.com\//i.test(url)) {
    return `/api/center-image?u=${encodeURIComponent(url)}`;
  }
  return url;
}

const ACCENT = "#1d4ed8";
const ACCENT_ON_DARK = "#8fb2ff";

const HARRY: LeasingContact = {
  name: "Harry Feldman",
  company: "Korman Commercial Properties",
  phone: "(215) 350-5933",
  phoneHref: "+12153505933",
  email: "hfeldman@kormancommercial.com",
  site: "kormancommercial.com",
};

// ─── Gray's Ferry (4500) — fully built to the design handoff ──────────────────
const GRAYS_FERRY: CenterProfile = {
  code: "4500",
  slug: "grays-ferry",
  name: "Grays Ferry Shopping Center",
  h1: ["Grays Ferry", "Shopping Center"],
  heroOneLine: true,
  addressLine: "2897 Grays Ferry Ave, Philadelphia, PA",
  streetAddress: "2897 Grays Ferry Avenue",
  city: "Philadelphia",
  state: "PA",
  zip: "19146",
  gla: 82809,
  anchorName: "Fresh Grocer",
  heroSub:
    "The bridge between Center City and University City — grocery-anchored neighborhood retail at the Schuylkill crossing.",
  overview:
    "Grays Ferry Shopping Center is a key neighborhood retail center serving the daily needs of a growing and emerging community. With a mix of essential services and conveniences, it remains a trusted destination for local residents. Its strategic location offers proximity to the Pennovation Center and easy accessibility to the Health District of West Philadelphia, making it well-positioned to support the area's continued growth.",
  keyTenants:
    "The Fresh Grocer, Fine Wine & Good Spirits, Chase Bank, JP Morgan, McDonald's",
  parking: "300+ surface spaces",
  parkingShort: "300+",
  extraFacts: [
    { k: "To I-76 ramp", v: "0.5 mi" },
    { k: "To Center City", v: "3 mi" },
  ],
  location: {
    heading: "Three miles from everything.",
    blurb:
      "I-76 a half mile north, the Pennovation Center and West Philadelphia's health district across the river, 30th Street Station eight minutes out.",
    access: [
      { k: "I-76 / Schuylkill Expressway", v: "0.5 mi" },
      { k: "Pennovation Center", v: "0.7 mi" },
      { k: "University City & Penn/CHOP", v: "1.5 mi" },
      { k: "Center City", v: "3 mi" },
      { k: "30th Street Station", v: "8 min" },
    ],
  },
  neighborhood: [
    {
      img: "Grays Ferry Crescent / river trail",
      title: "River trail at the door",
      body: "The Grays Ferry Crescent Trail and skatepark put the Schuylkill riverfront a few blocks from the parking field.",
    },
    {
      img: "Pennovation Works exterior",
      title: "Pennovation across the bridge",
      body: "Penn's research and startup campus keeps growing on the far bank, adding daytime population to the trade area.",
    },
    {
      img: "Rowhouse street / streetscape",
      title: "Dense rowhouse trade area",
      body: "Established South Philadelphia blocks plus the Greater Grays Ferry Estates redevelopment feed steady, walk-in grocery traffic.",
    },
  ],
  availableBlurb:
    "Divisible and combinable. Landlord will discuss TI for the right use.",
  // Leasing-managed availabilities. NOTE (owner): confirm suites, SF and copy
  // before launch — these mirror the design's sample set.
  marketedSpaces: [
    { suite: "Suite 108", sf: 2450, kind: "Inline retail", frontage: "42 ft frontage", notes: "Corner bay, grocery-adjacent" },
    { suite: "Suite 112", sf: 1180, kind: "Inline retail", frontage: "22 ft frontage", notes: "Second-generation inline retail" },
    { suite: "Pad B", sf: 3000, kind: "Freestanding pad", frontage: "Drive-thru capable", notes: "Freestanding pad, avenue visibility" },
  ],
  categories: {
    freshgrocer: "Grocery",
    thefreshgrocer: "Grocery",
    plcb: "Wine & spirits",
    finewinegoodspirits: "Wine & spirits",
    jpmorgan: "Banking & financial services",
    chasebank: "Banking",
    chase: "Banking",
    hilti: "Retail — tools & supply",
    victrainc: "Wireless (Verizon)",
    victra: "Wireless (Verizon)",
    nailparlor: "Health & beauty",
    curlcare: "Health & beauty",
    usps: "Civic / postal",
    mcdonalds: "Quick service restaurant",
    hrblock: "Tax & financial services",
  },
  displayNames: {
    freshgrocer: "The Fresh Grocer",
    plcb: "Fine Wine & Good Spirits",
    usps: "U.S. Post Office",
    victrainc: "Verizon",
    victra: "Verizon",
    jpmorgan: "JP Morgan Chase",
  },
  contact: HARRY,
  geo: { lat: 39.9438, lng: -75.1902 },
  seo: {
    title: "Grays Ferry Shopping Center | Retail Space for Lease, Philadelphia PA",
    description:
      "Grays Ferry Shopping Center, 2897 Grays Ferry Avenue, Philadelphia PA. 82,809 SF neighborhood retail anchored by The Fresh Grocer, with Fine Wine & Good Spirits, Chase Bank and McDonald's. Retail space for lease from Korman Commercial Properties.",
    keywords:
      "retail space for lease Philadelphia, Grays Ferry Shopping Center, shopping center Philadelphia, retail for rent, Korman Commercial Properties",
    ogTitle: "Grays Ferry Shopping Center — Retail Space for Lease",
    ogDescription:
      "82,809 SF of anchored neighborhood retail on Grays Ferry Avenue, minutes from Center City, University City and I-76.",
  },
  assets: {},
  accent: ACCENT,
  accentOnDark: ACCENT_ON_DARK,
  showSquareFootage: false,
};

// ─── The other four centers — valid profiles from the property master ─────────
// Marketing copy / availability / photos are placeholders for the owner to
// finalize; tenancy still syncs live from the rent roll. Address, GLA, city and
// anchor come from PROPERTY_DEFS / the retail registry.
function scaffold(
  code: string,
  slug: string,
  h1: [string, string],
  anchorName: string,
  categories: Record<string, string>,
  overrides: Partial<CenterProfile> = {},
): CenterProfile {
  const def = PROPERTY_DEFS.find((p) => p.id === code);
  const name = def?.name ?? h1.join(" ");
  const city = def?.city ?? "Philadelphia";
  const state = def?.state ?? "PA";
  const addr = def?.address ?? "";
  const gla = def?.sqft ?? 0;
  const addressLine = `${addr}, ${city}, ${state}`;
  return {
    code,
    slug,
    name,
    h1,
    addressLine,
    streetAddress: addr,
    city,
    state,
    zip: def?.zip,
    gla,
    anchorName,
    heroSub: `${gla.toLocaleString("en-US")} SF of neighborhood retail in ${city}.`,
    overview: `${name} is a Korman Commercial Properties neighborhood retail center in ${city}. Marketing copy to be finalized.`,
    keyTenants: "",
    parking: "Surface parking",
    parkingShort: "Yes",
    extraFacts: [],
    location: { heading: "In the neighborhood.", blurb: "", access: [] },
    neighborhood: [],
    availableBlurb: "Contact the leasing team for current availability.",
    marketedSpaces: [],
    categories,
    contact: HARRY,
    seo: {
      title: `${name} | Retail Space for Lease`,
      description: `${name}, ${addressLine}. Retail space for lease from Korman Commercial Properties.`,
      keywords: `${name}, retail space for lease, Korman Commercial Properties`,
      ogTitle: `${name} — Retail Space for Lease`,
      ogDescription: `Neighborhood retail for lease at ${addressLine}.`,
    },
    assets: {},
    accent: ACCENT,
    accentOnDark: ACCENT_ON_DARK,
    showSquareFootage: false,
    ...overrides,
  };
}

const BROOKWOOD = scaffold(
  "2300",
  "brookwood",
  ["Brookwood", "Shopping Center"],
  "Planet Fitness",
  {
    planetfitness: "Fitness",
    mtbank: "Banking",
    craftycrab: "Restaurant — seafood",
    ediblearrangements: "Specialty food & gifts",
    cohenfashionoptical: "Optical",
    tmobilenortheastllc: "Wireless",
    tmobile: "Wireless",
    chinasun: "Restaurant",
    leeshoagiehouse: "Restaurant — hoagies",
    evolvenails: "Health & beauty",
    gnclivewell: "Health & nutrition",
    citizensbankofpa: "Banking",
    dunkindonuts: "Coffee & bakery",
    wawa: "Convenience & fuel",
  },
  {
    zip: "19020",
    heroSub:
      "Everyday retail on Bensalem's Street Road — a fitness-anchored center at one of Lower Bucks County's busiest crossroads.",
    overview:
      "Brookwood Shopping Center sits on Street Road (Route 132) in Bensalem, one of Lower Bucks County's highest-traffic retail corridors. Anchored by Planet Fitness and a deep mix of daily-need tenants — banking, dining, wireless, and health & beauty — it draws steady traffic from the surrounding residential neighborhoods and the commuter flow between I-95 and the Pennsylvania Turnpike.",
    parking: "Ample surface parking",
    parkingShort: "On-site",
    extraFacts: [
      { k: "Corridor", v: "Street Road (Rte 132)" },
      { k: "County", v: "Bucks" },
    ],
    location: {
      heading: "At the Street Road crossroads.",
      blurb:
        "On Route 132 in Bensalem, minutes from I-95, the Pennsylvania Turnpike and the Neshaminy retail corridor.",
      access: [
        { k: "Street Road (Rte 132)", v: "Frontage" },
        { k: "I-95", v: "Minutes" },
        { k: "PA Turnpike", v: "Minutes" },
      ],
    },
    neighborhood: [
      { img: "Street Road retail corridor", title: "Street Road traffic", body: "Route 132 is Bensalem's main retail spine, carrying steady commuter and shopper traffic past the center all day." },
      { img: "I-95 / PA Turnpike interchange", title: "Between two highways", body: "The center sits within minutes of both I-95 and the Pennsylvania Turnpike, pulling from a wide Lower Bucks trade area." },
      { img: "Bensalem neighborhood rooftops", title: "Dense rooftops around it", body: "Established Bensalem neighborhoods and apartment communities feed a reliable daily-needs customer base." },
    ],
    availableBlurb: "Inline and pad opportunities. Landlord will discuss TI for the right use.",
    seo: {
      title: "Brookwood Shopping Center | Retail Space for Lease, Bensalem PA",
      description:
        "Brookwood Shopping Center, 1847 Street Road, Bensalem PA. Fitness-anchored neighborhood retail on Route 132 with banking, dining and daily-need tenants. Retail space for lease from Korman Commercial Properties.",
      keywords:
        "retail space for lease Bensalem, Brookwood Shopping Center, Street Road retail, shopping center Bucks County, Korman Commercial Properties",
      ogTitle: "Brookwood Shopping Center — Retail Space for Lease",
      ogDescription:
        "Fitness-anchored neighborhood retail on Bensalem's Street Road, minutes from I-95 and the PA Turnpike.",
    },
  },
);

const LAFAYETTE_HILL = scaffold(
  "9510",
  "lafayette-hill",
  ["Shops at", "Lafayette Hill"],
  "Wawa",
  { wawa: "Convenience & fuel" },
  {
    zip: "19444",
    heroSub:
      "A convenience-anchored strip on Germantown Pike, serving one of Montgomery County's most established communities.",
    overview:
      "The Shops at Lafayette Hill line Germantown Pike in Whitemarsh Township, an established, affluent Montgomery County community northwest of the city. Anchored by Wawa, the center pairs everyday convenience with easy access to Plymouth Meeting, Chestnut Hill and the Blue Route (I-476).",
    parking: "Surface parking at the door",
    parkingShort: "On-site",
    extraFacts: [
      { k: "Corridor", v: "Germantown Pike" },
      { k: "Township", v: "Whitemarsh" },
    ],
    location: {
      heading: "On the Pike in Lafayette Hill.",
      blurb:
        "Germantown Pike frontage in Whitemarsh Township, minutes from Plymouth Meeting, Chestnut Hill and I-476.",
      access: [
        { k: "Germantown Pike", v: "Frontage" },
        { k: "I-476 (Blue Route)", v: "Minutes" },
        { k: "Plymouth Meeting", v: "Minutes" },
      ],
    },
    neighborhood: [
      { img: "Germantown Pike streetscape", title: "Germantown Pike", body: "The Pike is Lafayette Hill's main street, carrying daily local traffic past the shops." },
      { img: "Whitemarsh / Lafayette Hill homes", title: "Established, affluent trade area", body: "Whitemarsh Township's stable rooftops and strong household incomes support steady neighborhood spending." },
      { img: "Blue Route regional access", title: "Minutes to the Blue Route", body: "Quick access to I-476 and Plymouth Meeting keeps the center connected to the wider Montgomery County market." },
    ],
    availableBlurb: "Compact inline suites for neighborhood-serving uses. Contact the leasing team for current availability.",
    seo: {
      title: "Shops at Lafayette Hill | Retail Space for Lease, Lafayette Hill PA",
      description:
        "The Shops at Lafayette Hill, 400-428 Germantown Pike, Lafayette Hill PA. Wawa-anchored convenience retail in Whitemarsh Township, Montgomery County. Retail space for lease from Korman Commercial Properties.",
      keywords:
        "retail space for lease Lafayette Hill, Shops at Lafayette Hill, Germantown Pike retail, Montgomery County shopping center, Korman Commercial Properties",
      ogTitle: "Shops at Lafayette Hill — Retail Space for Lease",
      ogDescription:
        "Convenience retail on Germantown Pike in Whitemarsh Township, minutes from Plymouth Meeting and I-476.",
    },
  },
);

const PARKWOOD = scaffold(
  "7010",
  "parkwood",
  ["Parkwood", "Shopping Center"],
  "",
  {},
  {
    zip: "19154",
    heroSub:
      "Neighborhood shopping and office space on Academy Road, at the heart of Far Northeast Philadelphia's Parkwood community.",
    overview:
      "Parkwood Shopping/Office Center anchors Academy Road in Far Northeast Philadelphia, combining neighborhood retail with second-floor office space. Surrounded by the dense residential streets of Parkwood and minutes from Woodhaven Road, I-95 and the Philadelphia Mills corridor, it serves as a daily-needs hub for one of the Northeast's most stable communities.",
    parking: "Ample surface parking",
    parkingShort: "On-site",
    extraFacts: [
      { k: "Corridor", v: "Academy Road" },
      { k: "Area", v: "Far Northeast Philadelphia" },
      { k: "Uses", v: "Retail + office" },
    ],
    location: {
      heading: "The center of Parkwood.",
      blurb:
        "On Academy Road in Far Northeast Philadelphia, minutes from Woodhaven Road (Rte 63), I-95 and Philadelphia Mills.",
      access: [
        { k: "Academy Road", v: "Frontage" },
        { k: "Woodhaven Road (Rte 63)", v: "Minutes" },
        { k: "I-95", v: "Minutes" },
      ],
    },
    neighborhood: [
      { img: "Academy Road corridor", title: "On Academy Road", body: "Academy Road is Parkwood's main artery, carrying steady local traffic to the center." },
      { img: "Parkwood rowhomes", title: "Dense residential base", body: "The Parkwood neighborhood's established rowhome blocks put a large daily-needs population at the door." },
      { img: "Woodhaven Road / I-95 access", title: "Northeast highway access", body: "Woodhaven Road and I-95 connect the center to the wider Far Northeast and Lower Bucks trade area." },
    ],
    availableBlurb: "Retail inline space and second-floor office suites. Landlord will discuss TI for the right use.",
    seo: {
      title: "Parkwood Shopping/Office Center | Retail & Office for Lease, Philadelphia PA",
      description:
        "Parkwood Shopping/Office Center, 12301-12377 Academy Road, Philadelphia PA. Neighborhood retail and office space in Far Northeast Philadelphia, minutes from I-95 and Philadelphia Mills. Space for lease from Korman Commercial Properties.",
      keywords:
        "retail space for lease Northeast Philadelphia, Parkwood Shopping Center, Academy Road retail, office space Far Northeast, Korman Commercial Properties",
      ogTitle: "Parkwood Shopping/Office Center — Retail & Office for Lease",
      ogDescription:
        "Neighborhood retail and office on Academy Road in Far Northeast Philadelphia, minutes from Woodhaven Road and I-95.",
    },
  },
);

const PARKWOOD_PRO = scaffold(
  "1100",
  "parkwood-professional",
  ["Parkwood", "Professional Building"],
  "",
  {},
  {
    zip: "19154",
    heroSub:
      "Professional and medical office suites on Academy Road, across from Parkwood Shopping Center in Far Northeast Philadelphia.",
    overview:
      "The Parkwood Professional Building offers professional and medical office space on Academy Road in Far Northeast Philadelphia, directly across from Parkwood Shopping Center. Its established location, surrounding rooftops and easy Woodhaven Road / I-95 access make it a practical home for neighborhood-serving practices and service businesses.",
    parking: "Surface parking at the door",
    parkingShort: "On-site",
    extraFacts: [
      { k: "Corridor", v: "Academy Road" },
      { k: "Use", v: "Professional / medical office" },
      { k: "Area", v: "Far Northeast Philadelphia" },
    ],
    location: {
      heading: "Professional space in Parkwood.",
      blurb:
        "Academy Road frontage across from Parkwood Shopping Center, minutes from Woodhaven Road (Rte 63) and I-95.",
      access: [
        { k: "Academy Road", v: "Frontage" },
        { k: "Woodhaven Road (Rte 63)", v: "Minutes" },
        { k: "I-95", v: "Minutes" },
      ],
    },
    neighborhood: [
      { img: "Academy Road / Parkwood", title: "Across from Parkwood Center", body: "Sits directly opposite Parkwood Shopping Center, sharing the neighborhood's daily traffic." },
      { img: "Professional / medical office suite", title: "Built for practices", body: "Suited to medical, professional and service tenants serving the Far Northeast." },
      { img: "Northeast highway access", title: "Easy Northeast access", body: "Minutes from Woodhaven Road and I-95, convenient for staff and patients across the Northeast." },
    ],
    availableBlurb: "Professional and medical office suites. Contact the leasing team for current availability.",
    seo: {
      title: "Parkwood Professional Building | Office Space for Lease, Philadelphia PA",
      description:
        "Parkwood Professional Building, 12300-12310 Academy Road, Philadelphia PA. Professional and medical office suites in Far Northeast Philadelphia, across from Parkwood Shopping Center. Office space for lease from Korman Commercial Properties.",
      keywords:
        "office space for lease Northeast Philadelphia, Parkwood Professional Building, medical office Academy Road, professional office Far Northeast, Korman Commercial Properties",
      ogTitle: "Parkwood Professional Building — Office Space for Lease",
      ogDescription:
        "Professional and medical office suites on Academy Road in Far Northeast Philadelphia, across from Parkwood Shopping Center.",
    },
  },
);

export const CENTER_PROFILES: CenterProfile[] = [
  GRAYS_FERRY,
  BROOKWOOD,
  LAFAYETTE_HILL,
  PARKWOOD,
  PARKWOOD_PRO,
];

export function centerBySlug(slug: string): CenterProfile | undefined {
  return CENTER_PROFILES.find((c) => c.slug === slug);
}

export function centerByCode(code: string): CenterProfile | undefined {
  return CENTER_PROFILES.find((c) => c.code === code);
}
