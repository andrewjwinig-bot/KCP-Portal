// Public websites served by the portal on their OWN domains (edge-safe, pure).
//
// The portal answers at portal.kormancommercial.com. The company website
// (/site) and The Office Works site (/office-works) live inside it, and
// their own domains are attached to the same Vercel project: a request
// arriving on one of those hosts is REWRITTEN into its section, so
// kormancommercial.com/company serves /site/company with the URL unchanged.
// Paths already inside the section (the site's own /site/... links), the
// shared public pages and Next's internals pass straight through.

export const SITE_HOSTS = ["kormancommercial.com", "www.kormancommercial.com"];

/** The Office Works domain(s): OFFICE_WORKS_HOSTS (comma-separated) on top of
 *  any listed here. A host listed here must ALSO be in the website-host
 *  matcher in middleware.ts — the portal's matcher skips public paths, so
 *  only that entry makes middleware see (and lock down) every request on it. */
export const OFFICE_WORKS_HOSTS: string[] = ["theofficeworks.com", "theofficeworks.net"];

/** A designed centre page's own domain(s) → the page it serves (owner: "two
 *  domains specifically for the 2300 page"). One page per domain, like The
 *  Office Works. Also listed in the middleware's website-host regex. */
export const CENTER_HOSTS: Record<string, string> = {
  "brookwoodshoppingcenter.com": "/centers/brookwood",
  "brookwood-shopping.com": "/centers/brookwood",
  "parkwoodshoppingcenter.com": "/centers/parkwood",
};

export function hostBase(host: string | null | undefined, env: string | undefined = process.env.OFFICE_WORKS_HOSTS): string | null {
  const h = String(host ?? "").toLowerCase().split(":")[0].trim();
  if (!h) return null;
  if (SITE_HOSTS.includes(h)) return "/site";
  const center = CENTER_HOSTS[h] ?? CENTER_HOSTS[h.replace(/^www\./, "")];
  if (center) return center;
  const ow = [...OFFICE_WORKS_HOSTS, ...(env ?? "").split(",")].map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (ow.includes(h) || ow.includes(h.replace(/^www\./, ""))) return "/office-works";
  return null;
}

/** Paths a website host may serve besides its own section: Next's internals,
 *  the public endpoints its forms and images call, and the shared public
 *  assets (the site's photos, the Office Works page's, the centre pages and
 *  their flyer kit). */
const WEBSITE_PASSTHROUGH = [
  /^\/_next\//,
  /^\/api\/website\//,
  /^\/api\/maintenance\/submit$/,
  /^\/api\/center-image$/,
  // The tenant Service Request forms (/service → /submit maintenance,
  // /reserve a room) — public portal pages tenants reach from the website,
  // and the public endpoints they call.
  /^\/(service|submit|reserve)\/?$/,
  /^\/api\/reservations\/(submit|tenants)$/,
  /^\/api\/tenants\/(lookup|companies)$/,
  /^\/(site|office-works|centers)(\/|$)/,
  /^\/(robots\.txt|korman-logo\.svg)$/,
];

export type WebsiteRoute = { kind: "pass" } | { kind: "rewrite"; path: string } | { kind: "notFound" };

/**
 * A website domain serves ONLY the website (owner: "is it right to have it
 * part of the portal?" — yes, for the live rent-roll data, but locked down).
 * On kormancommercial.com or the Office Works domain: the section and the
 * public paths above pass; every other API answers 404; any other page path
 * is read as a page of the website (`/company` → `/site/company`), so a
 * portal page (/login, /dashboard, /submit) is never served there. Null on
 * any other host — the portal's own rules apply.
 */
export function websiteRoute(host: string | null | undefined, pathname: string, env?: string): WebsiteRoute | null {
  const base = hostBase(host, env);
  if (!base) return null;
  if (WEBSITE_PASSTHROUGH.some((re) => re.test(pathname))) return { kind: "pass" };
  // The portal has no favicon.ico, so the browser's automatic request fell to
  // the PORTAL's 404 page — "KCP Portal · internal portal" in its metadata.
  // The website's own icon answers it instead.
  if (pathname === "/favicon.ico") return { kind: "rewrite", path: "/site/favicon.ico" };
  if (pathname.startsWith("/api/") || /\.[a-z0-9]{2,5}$/i.test(pathname)) return { kind: "notFound" };
  // The Office Works site and a centre's own domain are ONE page: any other
  // path is not found (a plain 404), never the portal's not-found page.
  if (base !== "/site" && pathname !== "/" && !/^\/(service|submit|reserve)\/?$/.test(pathname)) return { kind: "notFound" };
  return { kind: "rewrite", path: pathname === "/" ? base : `${base}${pathname}` };
}

/** Where a request on a website host is served from, or null to leave it. */
export function hostRewrite(host: string | null | undefined, pathname: string, env?: string): string | null {
  const r = websiteRoute(host, pathname, env);
  return r?.kind === "rewrite" ? r.path : null;
}
