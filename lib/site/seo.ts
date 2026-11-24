// SEARCH VISIBILITY for every public page (owner, 11/2026: "do an SEO audit
// and improve SEO and traffic drivers for all pages … this is our site so it
// should have good visibility"). ONE place for:
//
//   the canonical address   every page is reachable at several (kormancommercial.com/company,
//                           /site/company, portal.kormancommercial.com/site/company; a centre at
//                           its own domain AND /centers/<slug>) — the canonical tag names the one
//                           search engines should rank, so they never split it
//   descriptions            written for a prospect searching, not the CMS placeholder
//   structured data         schema.org JSON-LD: the company (Organization), each centre
//                           (ShoppingCenter), each property (Place), breadcrumbs
//   the designed pages      served whole as HTML (centres, The Office Works, the Interplex)
//                           — `designedHead` writes their meta block
//
// Pure — no storage.

import type { Metadata } from "next";
import { CENTER_HOSTS } from "@/lib/hostRoutes";

export const SITE_ORIGIN = "https://kormancommercial.com";
export const SITE_NAME = "Korman Commercial Properties";
export const OFFICE_WORKS_ORIGIN = "https://theofficeworks.com";
/** The share image when a page has none of its own (the home page's hero). */
export const DEFAULT_SHARE_IMAGE = "/site/home/option2.jpg";

export const HQ = {
  street: "8 Neshaminy Interplex, Suite 400",
  city: "Trevose",
  region: "PA",
  zip: "19053",
  lat: 40.1383,
  lng: -74.9813,
};

/** A website path ("/company", "/site/company", "/") → its canonical URL on
 *  kormancommercial.com, where the website is served at the root. */
export function canonicalUrl(path: string): string {
  const p = path.replace(/^\/site(?=\/|$)/, "") || "/";
  return `${SITE_ORIGIN}${p === "/" ? "" : p}`.replace(/\/$/, "") || SITE_ORIGIN;
}

/** A designed centre page (`/centers/<slug>`) → its canonical: the centre's
 *  own domain where it has one, else kormancommercial.com/centers/<slug>. */
export function centerCanonical(slug: string): string {
  const path = `/centers/${slug === "parkwood-professional" ? "parkwood-commons" : slug}`;
  const own = Object.entries(CENTER_HOSTS).find(([host, p]) => p === path && !host.includes("-"));
  return own ? `https://${own[0]}` : `${SITE_ORIGIN}${path}`;
}

export const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${SITE_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`);

const postal = (a: { street?: string | null; city?: string | null; region?: string | null; zip?: string | null }) => ({
  "@type": "PostalAddress",
  ...(a.street ? { streetAddress: a.street } : {}),
  ...(a.city ? { addressLocality: a.city } : {}),
  ...(a.region ? { addressRegion: a.region } : {}),
  ...(a.zip ? { postalCode: a.zip } : {}),
  addressCountry: "US",
});

/** The company, on the home page and every designed page. */
export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "RealEstateAgent"],
    "@id": `${SITE_ORIGIN}/#organization`,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/site/email/korman-signature.png`,
    image: absolute(DEFAULT_SHARE_IMAGE),
    description: "Developers, owners and managers of office, retail and residential real estate in Philadelphia and Bucks and Montgomery Counties, Pennsylvania, since 1919.",
    address: postal({ street: HQ.street, city: HQ.city, region: HQ.region, zip: HQ.zip }),
    geo: { "@type": "GeoCoordinates", latitude: HQ.lat, longitude: HQ.lng },
    areaServed: ["Philadelphia, PA", "Bucks County, PA", "Montgomery County, PA"],
    email: "info@kormancommercial.com",
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    url: SITE_ORIGIN,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.url) })),
  };
}

export type PlaceInput = {
  name: string; url: string; description?: string | null; image?: string | null;
  street?: string | null; city?: string | null; region?: string | null; zip?: string | null;
  lat?: number | null; lng?: number | null;
  /** "ShoppingCenter" for a centre; "Place" otherwise. */
  type?: "ShoppingCenter" | "Place" | "LocalBusiness";
  email?: string | null; phone?: string | null;
};

export function placeLd(p: PlaceInput) {
  return {
    "@context": "https://schema.org",
    "@type": p.type ?? "Place",
    name: p.name,
    url: absolute(p.url),
    ...(p.description ? { description: p.description } : {}),
    ...(p.image ? { image: absolute(p.image) } : {}),
    address: postal({ street: p.street, city: p.city, region: p.region, zip: p.zip }),
    ...(p.lat != null && p.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } } : {}),
    ...(p.email ? { email: p.email } : {}),
    ...(p.phone ? { telephone: p.phone } : {}),
    publicAccess: true,
    ...(p.type !== "LocalBusiness" ? { manager: { "@id": `${SITE_ORIGIN}/#organization` } } : {}),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** JSON for a <script>: "<" escaped so a value can never close the tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** The meta block for a page served whole as HTML (a designed centre, The
 *  Office Works, the Interplex): description, canonical, Open Graph, Twitter,
 *  and its JSON-LD. Inserted before the page's own <title>. */
export function designedHead(h: { title: string; description: string; canonical: string; image?: string | null; jsonLd?: unknown[]; siteName?: string }): string {
  const img = h.image ? absolute(h.image) : absolute(DEFAULT_SHARE_IMAGE);
  return [
    `<meta name="description" content="${esc(h.description)}">`,
    `<link rel="canonical" href="${esc(h.canonical)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(h.siteName ?? SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(h.title)}">`,
    `<meta property="og:description" content="${esc(h.description)}">`,
    `<meta property="og:url" content="${esc(h.canonical)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(h.title)}">`,
    `<meta name="twitter:description" content="${esc(h.description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    ...(h.jsonLd ?? []).map((d) => `<script type="application/ld+json">${ldJson(d)}</script>`),
  ].join("\n");
}

/** Drop the page's own description (the head block carries the written one)
 *  and lay the block in before its <title>; a page with no <html> gets one
 *  with lang="en". */
export function withDesignedHead(html: string, head: string, title?: string): string {
  let out = html.replace(/<meta\s+name="description"[^>]*>\s*/i, "");
  // The search title (what a result shows) replaces the page's short one.
  if (title) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  out = out.replace(/<title>/i, `${head}\n<title>`);
  if (!/<html[\s>]/i.test(out)) out = `<!doctype html>\n<html lang="en">\n${out}`;
  return out;
}

/** Written descriptions (≤ ~160 characters) for what a prospect searches. */
export const PAGE_DESCRIPTIONS = {
  home: "Korman Commercial Properties owns and manages office, retail and residential real estate in Philadelphia and Bucks County, PA — including Neshaminy Interplex and The Office Works.",
  company: "A family-owned Philadelphia real estate company since 1919 — developing, owning and managing office parks, shopping centers and residential properties.",
  currentProperties: "Office parks, shopping centers, residential and land in Philadelphia, Bucks and Montgomery Counties, PA — owned and managed by Korman Commercial Properties.",
  availableSpace: "Office and retail space for lease in Philadelphia and Bucks County, PA — every vacancy live from our rent roll. Filter by type, property and size.",
  contact: "Contact Korman Commercial Properties, 8 Neshaminy Interplex, Trevose, PA — leasing inquiries for office and retail space, and general questions.",
  maintenance: "Korman Commercial Properties tenants: submit a maintenance or service request for your suite online, any time.",
  privacy: "How Korman Commercial Properties collects, uses and protects information submitted through kormancommercial.com.",
} as const;

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  retail: "Shopping centers and retail space for lease in Philadelphia and the suburbs — Gray's Ferry, Brookwood, Parkwood, Lafayette Hill and more. Korman Commercial Properties.",
  office: "Office space for lease at Neshaminy Interplex Business Center in Trevose, Bucks County, PA, plus furnished private offices at The Office Works.",
  residential: "Residential rental homes and duplexes in Montgomery County and Philadelphia, PA, owned and managed by Korman Commercial Properties.",
  land: "Development land and sites in Pennsylvania and New Jersey held by Korman Commercial Properties.",
};

/** A website page's metadata: its title, written description, canonical on
 *  kormancommercial.com, and the Open Graph / Twitter share card. */
export function pageMeta(m: { title?: string; absoluteTitle?: string; description: string; path: string; image?: string | null }): Metadata {
  const url = canonicalUrl(m.path);
  const image = absolute(m.image || DEFAULT_SHARE_IMAGE);
  const shareTitle = m.absoluteTitle ?? (m.title ? `${m.title} | ${SITE_NAME}` : SITE_NAME);
  return {
    ...(m.absoluteTitle ? { title: { absolute: m.absoluteTitle } } : m.title ? { title: m.title } : {}),
    description: m.description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url, title: shareTitle, description: m.description, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: shareTitle, description: m.description, images: [image] },
  };
}
