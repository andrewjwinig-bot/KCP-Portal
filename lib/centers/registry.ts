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
);

const LAFAYETTE_HILL = scaffold(
  "9510",
  "lafayette-hill",
  ["Shops at", "Lafayette Hill"],
  "Wawa",
  { wawa: "Convenience & fuel" },
);

const PARKWOOD = scaffold(
  "7010",
  "parkwood",
  ["Parkwood", "Shopping Center"],
  "",
  {},
);

const PARKWOOD_PRO = scaffold(
  "1100",
  "parkwood-professional",
  ["Parkwood", "Professional Building"],
  "",
  {},
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
