import "server-only";
import { SITE_LISTINGS, type SiteImage, type SiteListing } from "./content";
import { DESIGNED, liveDesignedSuites } from "@/lib/centers/designed/render";
import { FLYERS, spaceLabel } from "@/lib/centers/designed/flyer";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { SITE_PROPERTIES } from "./content";
import { INTERPLEX_SLUG, OFFICE_WORKS_SLUG, SITE_ROLL_CODE, interplexListings, isRollProperty, officeWorksListings, singleTenantListings, withCmsCopy, type RollProperty } from "./rollListings";
import { centerPlateUrl } from "./floorplate";

// The website's availability listings for the shopping centres come from the
// PORTAL, not the copy cloned from the vendor's CMS: each centre's designed
// page already syncs its suites to the live rent roll (vacant → available at
// the roll's SF; leased → gone), so the website lists exactly what the centre
// page and its leasing flyers show. A listing the vendor CMS carried for the
// same space (matched by SF) lends its photos and details. Properties with no
// designed page keep their CMS listings until they are wired the same way.

const SITE_TO_DESIGNED: Record<string, string> = {
  "grays-ferry-shopping-center": "grays-ferry",
  "brookwood-shopping-center": "brookwood",
  "parkwood-shopping-center": "parkwood",
  "shops-of-lafayette-hill": "lafayette-hill",
  "parkwood-commons": "parkwood-professional",
};

const plain = (s: string) => s.replace(/&amp;/g, "&");

/** A designed suite that is OFFICE space inside a shopping centre — Parkwood's
 *  second-floor suites 201–218 (owner, 11/2026: "for office space it should
 *  also show the second floor of 7010 since thats office"). Read off the
 *  design's own floor line ("Suite 210 · Second floor") or its use. */
export const isOfficeSuite = (s: { addr?: boolean | string; use?: string; spaceUse?: string }) =>
  (typeof s.addr === "string" && /second floor/i.test(s.addr)) || /\boffice suite\b/i.test(`${s.spaceUse ?? ""} ${s.use ?? ""}`);

async function centreListings(siteSlug: string, designedSlug: string): Promise<SiteListing[] | null> {
  const live = await liveDesignedSuites(designedSlug).catch(() => null);
  if (!live) return null;
  const street = FLYERS[designedSlug]?.street ?? "";
  const cms = SITE_LISTINGS.filter((l) => l.property === siteSlug);
  return live.suites
    .filter((s) => s.status === "available")
    .map((s) => {
      const was = s.sf ? cms.find((l) => l.size === s.sf) : undefined;
      const details = (s.details ?? []).map((t) => ({ text: plain(t) }));
      return {
        id: `${designedSlug}-${s.id}`,
        property: siteSlug,
        space: plain(spaceLabel(s, street)),
        size: s.sf || null,
        minSize: null,
        maxSize: null,
        term: s.term ?? "Negotiable",
        rentalRate: s.rate ?? "Upon Request",
        rentType: was?.rentType ?? null,
        spaceUse: plain(s.spaceUse ?? s.use.split(" · ")[0] ?? "") || null,
        condition: s.condition ?? was?.condition ?? null,
        available: s.availableWhen ?? "Now",
        details: details.length ? details : was?.details ?? null,
        // A PDF floor plan cannot be drawn as an image — the site plan and a
        // photo stand in for it (withPropertyImages).
        // The suite highlighted on the site plan first, then its own floor
        // plan (an image; a PDF cannot be drawn) or the CMS photos.
        images: [
          { url: centerPlateUrl(designedSlug, s.id), alt: `${plain(spaceLabel(s, street))} on the site plan` },
          ...(s.floorplan && !s.floorplanPdf ? [{ url: s.floorplan, alt: `Floor plan of ${plain(spaceLabel(s, street))}` }] : was?.images ?? []),
        ],
        requestMoreInfoEmail: live.profile.contact.email,
        ...(isOfficeSuite(s) ? { category: "office" as const } : {}),
      } satisfies SiteListing;
    });
}

/** Every listing shows the property's SITE PLAN, and a PHOTO of the property
 *  where there is no site plan (owner: "none of the site plans are pulling …
 *  if there is not site plan available can you also show a property photo"),
 *  after any photo or floor plan of the space itself. A designed centre's
 *  plan and hero are its page's own. */
function propertyImages(siteSlug: string): SiteImage[] {
  // The Interplex and The Office Works listings carry their own photo and
  // plan (rollListings.ts); the CMS site plan is the same campus map again.
  if (siteSlug === INTERPLEX_SLUG || siteSlug === OFFICE_WORKS_SLUG) return [];
  const p = SITE_PROPERTIES.find((x) => x.slug === siteSlug);
  const name = p?.name ?? "Property";
  const d = SITE_TO_DESIGNED[siteSlug] ? DESIGNED[SITE_TO_DESIGNED[siteSlug]] : null;
  // A designed centre's listings lead with the suite on the site plan, so the
  // whole plan is not shown again.
  const plan = d ? null : p?.sitePlan?.url ?? null;
  const dir = d ? (d.assetDir ?? SITE_TO_DESIGNED[siteSlug]) : null;
  const photo = dir ? `/centers/${dir}/assets/hero.jpg` : p?.mainImage ?? p?.gallery?.[0]?.url ?? null;
  return [
    ...(plan ? [{ url: plan, alt: `Site plan of ${name}` }] : []),
    ...(photo ? [{ url: photo, alt: p?.mainImageAlt || name }] : []),
  ];
}

/** The leasing people, by the email a listing carries. */
const CONTACTS: Record<string, { name: string; phone: string }> = {
  "nfox@kormancommercial.com": { name: "Nancy Fox", phone: "(215) 244-5175" },
  "hfeldman@kormancommercial.com": { name: "Harry Feldman", phone: "(215) 244-5148" },
};

/** Each listing's call-out: the property's leasing contact (name, phone,
 *  email), else the person behind the listing's email; retail defaults to
 *  Harry, office to Nancy. */
export function withContact(listings: SiteListing[]): SiteListing[] {
  return listings.map((l) => {
    const p = SITE_PROPERTIES.find((x) => x.slug === l.property);
    const email = l.requestMoreInfoEmail || p?.leasingInquiryEmail || (p?.category === "office" ? "nfox@kormancommercial.com" : "hfeldman@kormancommercial.com");
    const known = CONTACTS[email.toLowerCase()];
    return {
      ...l,
      requestMoreInfoEmail: email,
      contactName: l.contactName ?? (p?.leasingInquiryEmail === email ? p?.leasingInquiryName : null) ?? known?.name ?? null,
      contactPhone: l.contactPhone ?? (p?.leasingInquiryEmail === email ? p?.leasingInquiryPhone : null) ?? known?.phone ?? null,
    };
  });
}

export function withPropertyImages(listings: SiteListing[]): SiteListing[] {
  const cache = new Map<string, SiteImage[]>();
  return listings.map((l) => {
    if (!cache.has(l.property)) cache.set(l.property, propertyImages(l.property));
    const own = (l.images ?? []).filter((i) => i?.url);
    const extra = cache.get(l.property)!.filter((i) => !own.some((o) => o.url === i.url));
    const images = [...own, ...extra];
    return { ...l, images: images.length ? images : null };
  });
}

/** The non-centre properties' listings off the CURRENT rent roll
 *  (rollListings.ts). Null when no roll is reachable — those properties then
 *  list nothing rather than stale CMS copy. */
async function rollListings(): Promise<Map<string, SiteListing[]> | null> {
  const roll = await resolveCurrentRentroll().catch(() => null);
  if (!roll) return null;
  const props = roll.properties as unknown as RollProperty[];
  const email = (slug: string) => SITE_PROPERTIES.find((p) => p.slug === slug)?.leasingInquiryEmail ?? null;
  const out = new Map<string, SiteListing[]>();
  out.set(INTERPLEX_SLUG, interplexListings(props, email(INTERPLEX_SLUG) ?? "nfox@kormancommercial.com"));
  out.set(OFFICE_WORKS_SLUG, officeWorksListings(props, email(OFFICE_WORKS_SLUG) ?? "nfox@kormancommercial.com"));
  for (const slug of Object.keys(SITE_ROLL_CODE)) out.set(slug, singleTenantListings(slug, props, email(slug) ?? "hfeldman@kormancommercial.com"));
  for (const [k, v] of out) out.set(k, withCmsCopy(v, SITE_LISTINGS));
  return out;
}

/** Every listing on the website, from the portal: the designed centres'
 *  synced suites and every other property's vacancies on the current rent
 *  roll. The vendor CMS copy is listed only for a property neither covers. */
export async function liveSiteListings(): Promise<SiteListing[]> {
  const [live, fromRoll] = await Promise.all([
    Promise.all(Object.entries(SITE_TO_DESIGNED).map(([site, d]) => centreListings(site, d).then((l) => [site, l] as const))),
    rollListings(),
  ]);
  const bySite = new Map<string, SiteListing[] | null>(live);
  for (const [k, v] of fromRoll ?? []) bySite.set(k, v);
  const out: SiteListing[] = [];
  for (const [site, l] of bySite) {
    if (l) out.push(...l);
    // A designed page that could not be built keeps the CMS copy, as before.
    else if (!isRollProperty(site)) out.push(...SITE_LISTINGS.filter((c) => c.property === site));
  }
  // A property neither the designed pages nor the roll covers keeps its CMS copy.
  for (const l of SITE_LISTINGS) if (!bySite.has(l.property) && !isRollProperty(l.property)) out.push(l);
  return withContact(withPropertyImages(out));
}

export async function liveListingsFor(slug: string): Promise<SiteListing[]> {
  const d = SITE_TO_DESIGNED[slug];
  if (d) { const l = await centreListings(slug, d); if (l) return withContact(withPropertyImages(l)); }
  if (isRollProperty(slug)) return withContact(withPropertyImages((await rollListings())?.get(slug) ?? []));
  return withContact(withPropertyImages(SITE_LISTINGS.filter((l) => l.property === slug)));
}
