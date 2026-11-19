// kormancommercial.com's sitemap (pure): every page of the website at its
// canonical address (lib/site/seo.ts). The designed centre pages are listed
// where they live on this domain; a centre with its own domain is listed by
// that domain's sitemap.

import { SITE_CATEGORIES, SITE_PROPERTIES } from "./content";
import { DESIGNED_PAGES } from "./paths";
import { SITE_ORIGIN, canonicalUrl, centerCanonical } from "./seo";

export type SitemapUrl = { loc: string; priority: number; changefreq: "daily" | "weekly" | "monthly" | "yearly" };

const DESIGNED_CENTRE_SLUGS = ["lafayette-hill", "brookwood", "grays-ferry", "parkwood", "parkwood-professional"];

export function sitemapUrls(): SitemapUrl[] {
  const out: SitemapUrl[] = [
    { loc: canonicalUrl("/"), priority: 1, changefreq: "weekly" },
    { loc: canonicalUrl("/available-space"), priority: 0.9, changefreq: "daily" },
    { loc: canonicalUrl("/current-properties"), priority: 0.8, changefreq: "monthly" },
    { loc: canonicalUrl("/company"), priority: 0.6, changefreq: "yearly" },
    { loc: canonicalUrl("/contact"), priority: 0.6, changefreq: "yearly" },
    { loc: canonicalUrl("/maintenance"), priority: 0.4, changefreq: "yearly" },
    { loc: canonicalUrl("/privacy-policy"), priority: 0.2, changefreq: "yearly" },
    { loc: canonicalUrl("/office/neshaminy-interplex"), priority: 0.9, changefreq: "daily" },
  ];
  for (const c of Object.keys(SITE_CATEGORIES)) out.push({ loc: canonicalUrl(`/${c}`), priority: 0.8, changefreq: "weekly" });
  // Property pages served by the template — not the ones that redirect to a designed page.
  for (const p of SITE_PROPERTIES) {
    if (DESIGNED_PAGES[p.slug] || p.slug === "neshaminy-interplex") continue;
    out.push({ loc: canonicalUrl(`/${p.category}/${p.slug}`), priority: 0.7, changefreq: "weekly" });
  }
  for (const slug of DESIGNED_CENTRE_SLUGS) {
    const loc = centerCanonical(slug);
    if (loc.startsWith(SITE_ORIGIN)) out.push({ loc, priority: 0.8, changefreq: "daily" });
  }
  const seen = new Set<string>();
  return out.filter((u) => !seen.has(u.loc) && seen.add(u.loc));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sitemapXml(urls: SitemapUrl[], today = new Date().toISOString().slice(0, 10)): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`),
    `</urlset>`,
    "",
  ].join("\n");
}
