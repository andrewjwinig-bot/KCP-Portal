import "server-only";
import { SITE_LISTINGS, type SiteListing } from "./content";
import { liveDesignedSuites } from "@/lib/centers/designed/render";
import { FLYERS, spaceLabel } from "@/lib/centers/designed/flyer";

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
        images: s.floorplan ? [{ url: s.floorplan, alt: `Floor plan of ${plain(spaceLabel(s, street))}` }] : was?.images ?? null,
        requestMoreInfoEmail: live.profile.contact.email,
      } satisfies SiteListing;
    });
}

/** Every listing on the website: live for the designed centres, the CMS copy elsewhere. */
export async function liveSiteListings(): Promise<SiteListing[]> {
  const live = await Promise.all(Object.entries(SITE_TO_DESIGNED).map(([site, d]) => centreListings(site, d).then((l) => [site, l] as const)));
  const bySite = new Map(live);
  const out: SiteListing[] = [];
  const done = new Set<string>();
  for (const l of SITE_LISTINGS) {
    const liveFor = bySite.get(l.property);
    if (liveFor) {
      if (!done.has(l.property)) { out.push(...liveFor); done.add(l.property); }
    } else out.push(l);
  }
  for (const [site, l] of bySite) if (l && !done.has(site)) out.push(...l);
  return out;
}

export async function liveListingsFor(slug: string): Promise<SiteListing[]> {
  const d = SITE_TO_DESIGNED[slug];
  if (d) { const l = await centreListings(slug, d); if (l) return l; }
  return SITE_LISTINGS.filter((l) => l.property === slug);
}
