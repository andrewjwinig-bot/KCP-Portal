// The leasing flyer and Available Space table on every designed centre page
// (shared/available.js) read two things the server fills in here:
//
//  - PROPERTY — the centre's flyer data. Name, address and the leasing contact
//    are the portal's (registry profile); GLA is the synced suites' (rent roll);
//    "neighbors" are the leading tenants on the synced roll. Only the flyer's
//    own copy (two-line name, stat tiles, highlights, which photos) is keyed
//    per centre below.
//  - Each AVAILABLE suite's marketing, laid over by the portal's own per-suite
//    descriptions (the "Public website" card on the property page — `availDesc`,
//    kind / frontage / notes), so staff edit availability copy in the portal.
//  - Each suite's floor plan uploaded there (`floorplans`), whatever its status.
//
// Pure: no storage, so it is tested directly.

import type { CenterProfile } from "../registry";
import type { AvailDesc } from "../store";
import type { DesignedSuite } from "./sync";

type Stat = { big: string; small: string; icon: "area" | "parking" | "pin" | "bag" | "car" | "store" };

export type FlyerConfig = {
  /** The PUBLIC name the page carries (the registry's can be internal —
   *  "Parkwood Professional Building" is marketed as Parkwood Commons). */
  name: string;
  flyerName: [string, string];
  /** The street a numeric suite id sits on ("12345" → "12345 Academy Rd"). */
  street: string;
  /** Stat tiles after the GLA tile (which is always first and live). */
  stats: Stat[];
  highlights: string[];
  /** Paths under the centre's assets folder. */
  flyerHero: string;
  flyerHeroY?: number;
  flyerPhotos: [string, string];
  hero: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = (n: number) => n.toLocaleString("en-US");

/** The leading tenants on the synced roll, largest first — never a "Coming soon". */
export function leadingTenants(suites: DesignedSuite[], n = 4): string[] {
  const seen = new Set<string>();
  return suites
    .filter((s) => s.status === "leased" && !s.shadow && s.tenant && s.tenant !== "Coming soon")
    .sort((a, b) => (b.sf || 0) - (a.sf || 0))
    .map((s) => s.tenant.replace(/&amp;/g, "&"))
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
    .slice(0, n);
}

export function propertyFor(profile: CenterProfile, cfg: FlyerConfig, suites: DesignedSuite[], gla: number, assetBase: string) {
  const a = (p: string) => `${assetBase}/${p}`;
  return {
    name: cfg.name,
    flyerName: cfg.flyerName,
    address: profile.addressLine,
    street: cfg.street,
    gla: `${fmt(gla)} SF`,
    keyTenants: leadingTenants(suites).join(", "),
    stats: [{ big: `${fmt(gla)} SF`, small: "GLA", icon: "area" }, ...cfg.stats].slice(0, 4),
    highlights: cfg.highlights,
    hero: a(cfg.hero),
    flyerHero: a(cfg.flyerHero),
    flyerHeroY: cfg.flyerHeroY ?? 0.5,
    flyerPhotos: cfg.flyerPhotos.map(a),
    logo: a("logo-white.png"),
    contact: { name: profile.contact.name, phone: profile.contact.phone, email: profile.contact.email },
    office: ["8 Neshaminy Interplex, Suite 400", "Trevose, PA 19053"],
    web: profile.contact.site || "kormancommercial.com",
  };
}

/** The portal's per-suite availability copy over an AVAILABLE suite: kind →
 *  space use, frontage and notes → detail bullets (after the design's own).
 *  The Public website card keys it by the roll's unit ref ("1100-30"), so a
 *  suite is looked up as `<code>-<suite>` as well as bare. A floor plan
 *  uploaded there is the SUITE's and applies whatever its status. */
export function withAvailDesc(
  suites: DesignedSuite[], desc: Record<string, AvailDesc>, code = "",
  floorplans: Record<string, string> = {},
): DesignedSuite[] {
  const keys = (s: DesignedSuite) => (s.units ?? [s.id]).flatMap((u) => [norm(`${code}-${u}`), norm(u)]);
  return suites.map((s) => {
    const fp = keys(s).map((k) => floorplans[k]).find(Boolean);
    const withFp = fp ? { ...s, floorplan: fp } : s;
    if (s.status !== "available") return withFp;
    const d = keys(s).map((k) => desc[k]).find(Boolean);
    if (!d) return withFp;
    const extra = [d.frontage, ...(d.notes || "").split(/\n+/)].map((x) => (x || "").trim()).filter(Boolean);
    return {
      ...withFp,
      spaceUse: d.kind?.trim() || s.spaceUse,
      details: [...(s.details ?? []), ...extra.filter((x) => !(s.details ?? []).includes(x))],
    };
  });
}

/** Each designed centre's flyer copy. Facts that change (GLA, tenants, the
 *  contact, which suites are available) are NOT here — they are live. */
export const FLYERS: Record<string, FlyerConfig> = {
  "lafayette-hill": {
    name: "Shops at Lafayette Hill", flyerName: ["LAFAYETTE", "HILL SHOPS"], street: "Germantown Pike",
    stats: [{ big: "Wawa", small: "Anchor", icon: "store" }, { big: "At the Door", small: "Parking", icon: "parking" },
      { big: "Germantown Pike", small: "Whitemarsh Twp", icon: "pin" }],
    highlights: [
      "Wawa-anchored center on Germantown Pike in Whitemarsh Township",
      "Established, affluent Montgomery County trade area",
      "Easy access to Plymouth Meeting, Chestnut Hill and the Blue Route",
      "Surface parking at the door",
    ],
    hero: "hero-wawa.webp", flyerHero: "hero-wawa.webp", flyerHeroY: 0.45, flyerPhotos: ["hero.jpg", "hero-wawa.webp"],
  },
  brookwood: {
    name: "Brookwood Shopping Center", flyerName: ["BROOKWOOD", "SHOPPING CENTER"], street: "Street Road",
    stats: [{ big: "Planet Fitness", small: "& Wawa", icon: "store" }, { big: "Large Lot", small: "Parking", icon: "parking" },
      { big: "Street Rd", small: "& US Route 13", icon: "car" }],
    highlights: [
      "Anchored by Planet Fitness and Wawa, with Ashley Homestore next door",
      "Strong visibility on Street Road, one of Bucks County's busiest corridors",
      "Signalized at Street Road and US Route 13",
      "Large surface parking lot",
    ],
    hero: "hero.jpg", flyerHero: "hero.jpg", flyerHeroY: 0.5, flyerPhotos: ["g-planet.jpg", "g-wawa.jpg"],
  },
  "grays-ferry": {
    name: "Gray's Ferry Shopping Center", flyerName: ["GRAY'S FERRY", "SHOPPING CENTER"], street: "Grays Ferry Ave",
    stats: [{ big: "Fresh Grocer", small: "Anchor", icon: "bag" }, { big: "Large Lot", small: "Parking", icon: "parking" },
      { big: "2 Signals", small: "Grays Ferry Ave", icon: "car" }],
    highlights: [
      "Grocery-anchored by The Fresh Grocer",
      "Near the Pennovation Center and West Philadelphia's Health District",
      "Two signalized entrances on Grays Ferry Ave",
      "Large surface parking lot",
    ],
    hero: "hero.jpg", flyerHero: "g-grocer.jpg", flyerHeroY: 0.5, flyerPhotos: ["g-row.jpg", "hero.jpg"],
  },
  parkwood: {
    name: "Parkwood Shopping Center", flyerName: ["PARKWOOD", "SHOPPING CENTER"], street: "Academy Rd",
    stats: [{ big: "Wawa · Dunkin'", small: "Pad tenants", icon: "store" }, { big: "Large Lot", small: "Parking", icon: "parking" },
      { big: "70+ Years", small: "Community staple", icon: "pin" }],
    highlights: [
      "Long-standing neighborhood hub with dining, services and everyday essentials",
      "Wawa and Dunkin' pads with drive-thru traffic",
      "Signalized at Academy Rd and Byberry Rd",
      "Second-floor office suites above the retail",
    ],
    hero: "hero.jpg", flyerHero: "g-sign.jpg", flyerHeroY: 0.5, flyerPhotos: ["g-wawa.jpg", "hero.jpg"],
  },
  "parkwood-professional": {
    name: "Parkwood Commons", flyerName: ["PARKWOOD", "COMMONS"], street: "Academy Rd",
    stats: [{ big: "On-Site", small: "Parking", icon: "parking" }, { big: "Prime Corner", small: "Location", icon: "pin" },
      { big: "Across", small: "from Super Wawa", icon: "bag" }],
    highlights: [
      "Neighborhood strip center directly across from Parkwood Shopping Center",
      "Strong visibility along a busy stretch of Academy Road",
      "Signalized corners at Byberry Rd and Medford Rd",
      "On-site parking behind the building",
    ],
    hero: "hero.jpg", flyerHero: "g-shear.jpg", flyerHeroY: 0.42, flyerPhotos: ["g-top.jpg", "hero.jpg"],
  },
};

/** The label an available suite carries everywhere — the centre page's table,
 *  its flyer, and the website's listings (mirrors `lab` in shared/available.js). */
export function spaceLabel(s: DesignedSuite, street: string): string {
  if (s.spaceName) return s.spaceName;
  if (typeof s.addr === "string") return s.addr.replace(/ ·.*/, "");
  return /^\d+$/.test(s.id) ? `${s.id} ${street}` : `Suite ${s.id}`;
}
