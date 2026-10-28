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
 *  any listed here. */
export const OFFICE_WORKS_HOSTS: string[] = [];

export function hostBase(host: string | null | undefined, env: string | undefined = process.env.OFFICE_WORKS_HOSTS): string | null {
  const h = String(host ?? "").toLowerCase().split(":")[0].trim();
  if (!h) return null;
  if (SITE_HOSTS.includes(h)) return "/site";
  const ow = [...OFFICE_WORKS_HOSTS, ...(env ?? "").split(",")].map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (ow.includes(h) || ow.includes(h.replace(/^www\./, ""))) return "/office-works";
  return null;
}

/** Where a request on a website host is served from, or null to leave it. */
export function hostRewrite(host: string | null | undefined, pathname: string, env?: string): string | null {
  const base = hostBase(host, env);
  if (!base) return null;
  if (pathname === base || pathname.startsWith(`${base}/`)) return null;
  if (/^\/(api|_next)\//.test(pathname) || pathname === "/favicon.ico" || pathname === "/robots.txt") return null;
  return pathname === "/" ? base : `${base}${pathname}`;
}
