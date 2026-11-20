// ONE PAGE PER AVAILABLE SPACE (owner, 11/2026: "does giving every vacant space
// its own page help with SEO? … suggest other similar spaces … add to compare
// up to three spaces … a download flyer for each space"). Pure: the address of
// a space, its title and description for search, and the spaces like it. The
// listings are the website's live ones (liveListings.ts) — a space has a page
// exactly while it is available.

import type { SiteListing, SiteProperty } from "./content";

export type SpaceListing = SiteListing & { propertyName: string; category: string; city: string | null };

/** The page's slug — the listing's own stable id ("interplex-4050-309",
 *  "brookwood-1879"), lower-cased and URL-safe. */
export const spaceSlug = (l: { id: string }) =>
  l.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const spacePath = (l: { id: string }) => `/site/space/${spaceSlug(l)}`;

export const spaceSize = (l: SiteListing) =>
  typeof l.size === "number" && l.size > 0 ? l.size : typeof l.maxSize === "number" && l.maxSize > 0 ? l.maxSize : typeof l.minSize === "number" ? l.minSize : 0;

export function sizeText(l: SiteListing): string {
  if (typeof l.minSize === "number" && typeof l.maxSize === "number" && l.minSize !== l.maxSize)
    return `${l.minSize.toLocaleString("en-US")} – ${l.maxSize.toLocaleString("en-US")} SF`;
  const n = spaceSize(l);
  return n ? `${n.toLocaleString("en-US")} SF` : "Size on request";
}

const kind = (category: string) => (category === "office" ? "Office" : category === "retail" ? "Retail" : "Commercial");

/** "Suite 309 · Building 5 — Office Space for Lease in Trevose, PA" */
export function spaceTitle(l: SpaceListing, p?: SiteProperty | null): string {
  const where = p?.city ? ` in ${p.city}${p.state ? `, ${p.state}` : ""}` : "";
  return `${l.space} at ${l.propertyName} — ${kind(l.category)} Space for Lease${where}`;
}

export function spaceDescription(l: SpaceListing, p?: SiteProperty | null): string {
  const where = p?.city ? ` in ${p.city}${p.state ? `, ${p.state}` : ""}` : "";
  const size = spaceSize(l) ? `${sizeText(l)} of ` : "";
  const detail = (l.details ?? []).map((d) => d.text).filter(Boolean).slice(0, 2).join(". ");
  const contact = l.contactName ? ` Contact ${l.contactName}${l.contactPhone ? ` at ${l.contactPhone}` : ""}.` : "";
  return `${size}${kind(l.category).toLowerCase()} space for lease at ${l.propertyName}${where}, available ${l.available || "now"}.${detail ? ` ${detail}.` : ""}${contact}`
    .replace(/\.\./g, ".");
}

/** The spaces most like `l`: the same type (office / retail), nearest in size
 *  (by ratio, so 1,000 vs 1,500 SF is as close as 10,000 vs 15,000), a space in
 *  another property nudged ahead of a near-twin next door so the list shows a
 *  choice. Never the space itself. */
export function similarSpaces<T extends SpaceListing>(l: T, all: T[], n = 3): T[] {
  const size = spaceSize(l);
  const score = (o: T) => {
    const s = spaceSize(o);
    const bySize = size && s ? Math.abs(Math.log(s / size)) : 2;
    return bySize + (o.property === l.property ? 0.1 : 0);
  };
  return all
    .filter((o) => o.id !== l.id && o.category === l.category)
    .map((o) => ({ o, s: score(o) }))
    .sort((a, b) => a.s - b.s || a.o.propertyName.localeCompare(b.o.propertyName))
    .slice(0, n)
    .map((x) => x.o);
}

/** The compare page holds at most three. */
export const COMPARE_MAX = 3;
export const comparePath = (slugs: string[]) => `/site/compare?spaces=${slugs.slice(0, COMPARE_MAX).map(encodeURIComponent).join(",")}`;

/** The website's listings with what the space pages read: the property's
 *  name, type and city (the Available Space page's own mapping). */
export function withPropertyInfo(listings: SiteListing[], properties: SiteProperty[]): SpaceListing[] {
  const bySlug = new Map(properties.map((p) => [p.slug, p]));
  return listings.map((l) => {
    const p = bySlug.get(l.property);
    return { ...l, propertyName: p?.name ?? "Other Properties", category: p?.category ?? "other", city: p?.city ?? null };
  });
}
