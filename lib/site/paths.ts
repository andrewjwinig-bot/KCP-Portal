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
