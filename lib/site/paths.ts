// Where the company website lives inside the portal. Every internal link on
// the site goes through `sitePath`, so moving it (e.g. serving it at the root
// of kormancommercial.com through a host rewrite) is a one-line change here.
export const SITE_BASE = "/site";

export function sitePath(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/" ? SITE_BASE : `${SITE_BASE}${p}`;
}

/** A photo under /public/site (the vendor site's /images/... assets). */
export const siteAsset = (path: string) => `/site/${path.replace(/^\/?(images\/)?/, "")}`;

/** The website's properties that have a DESIGNED page (the shopping centres,
 *  and The Office Works) (interactive site
 *  plan, tenant index, leasing flyers — lib/centers/designed): the website's
 *  property link goes there instead of the vendor-template page, and the old
 *  /site/retail/<slug> address redirects to it. Keyed by the website's slug. */
export const DESIGNED_PAGES: Record<string, string> = {
  "shops-of-lafayette-hill": "/centers/lafayette-hill",
  "brookwood-shopping-center": "/centers/brookwood",
  "grays-ferry-shopping-center": "/centers/grays-ferry",
  "parkwood-shopping-center": "/centers/parkwood",
  "parkwood-commons": "/centers/parkwood-commons",
  // The Office Works' own designed site (lib/officeWorks).
  "the-office-works-instant-offices": "/office-works",
};

/** Where a website property links: its designed centre page when it has one. */
export function propertyPath(category: string, slug: string): string {
  return DESIGNED_PAGES[slug] ?? sitePath(`/${category}/${slug}`);
}
