import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SITE_PROPERTIES } from "@/lib/site/content";
import { liveSiteListings } from "@/lib/site/liveListings";
import { propertyPath, sitePath } from "@/lib/site/paths";
import { absolute, breadcrumbLd, canonicalUrl, ldJson, pageMeta } from "@/lib/site/seo";
import { brandFor } from "@/lib/site/propertyBrand";
import { similarSpaces, sizeText, spaceDescription, spacePath, spaceSlug, spaceTitle, withPropertyInfo } from "@/lib/site/spaces";
import SpaceView from "./SpaceView";

// ONE PAGE PER AVAILABLE SPACE (lib/site/spaces.ts): its own address, title,
// description and share card for search and for sending to a prospect; the
// highlighted plan and photos, the facts, the leasing contact, the inquiry form
// (#8), a flyer, Compare, and the spaces like it. Built from the live listings
// and re-read every five minutes, so a space that leases leaves on its own —
// its address then goes to Available Space for that type.

export const revalidate = 300;

async function load(slug: string) {
  const all = withPropertyInfo(await liveSiteListings(), SITE_PROPERTIES);
  const l = all.find((x) => spaceSlug(x) === slug) ?? null;
  return { all, l, p: l ? SITE_PROPERTIES.find((p) => p.slug === l.property) ?? null : null };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { l, p } = await load(params.slug);
  if (!l) return { robots: { index: false } };
  const image = l.images?.find((i) => !/floorplate|\.svg/.test(i.url))?.url ?? p?.mainImage ?? null;
  return pageMeta({ absoluteTitle: spaceTitle(l, p), description: spaceDescription(l, p), path: spacePath(l), image });
}

export default async function SpacePage({ params }: { params: { slug: string } }) {
  const { all, l, p } = await load(params.slug);
  if (!l) redirect(sitePath("/available-space"));
  const url = spacePath(l);
  // A branded property (the Interplex, The Office Works) lists its own other
  // spaces first; "Similar spaces" then looks elsewhere so nothing shows twice.
  const brand = brandFor(l.property);
  const others = brand ? all.filter((x) => x.property === l.property && x.id !== l.id).slice(0, 6) : [];
  const similar = similarSpaces(l, brand ? all.filter((x) => x.property !== l.property) : all, 3);
  const propertyHref = p ? propertyPath(p.category, p.slug) : sitePath("/available-space");

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: `${l.space} at ${l.propertyName}`,
      url: canonicalUrl(url),
      description: spaceDescription(l, p),
      ...(l.images?.length ? { image: l.images.map((i) => absolute(i.url)) } : {}),
      offers: { "@type": "Offer", businessFunction: "http://purl.org/goodrelations/v1#LeaseOut", availability: "https://schema.org/InStock" },
      about: {
        "@type": "Place",
        name: l.propertyName,
        ...(p?.address ? { address: { "@type": "PostalAddress", streetAddress: p.address, addressLocality: p.city, addressRegion: p.state, addressCountry: "US" } } : {}),
        ...(p?.coordinates ? { geo: { "@type": "GeoCoordinates", latitude: p.coordinates.lat, longitude: p.coordinates.lng } } : {}),
        ...(sizeText(l) ? { floorSize: { "@type": "QuantitativeValue", value: l.size ?? l.maxSize ?? undefined, unitCode: "FTK" } } : {}),
      },
    },
    breadcrumbLd([
      { name: "Home", url: "/" },
      { name: "Available Space", url: "/available-space" },
      { name: l.propertyName, url: propertyHref.replace(/^\/site/, "") || "/" },
      { name: l.space, url: url.replace(/^\/site/, "") },
    ]),
  ];

  return (
    <>
      {ld.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(d) }} />)}
      <SpaceView l={l} property={p} brand={brand} others={others} similar={similar} pageUrl={canonicalUrl(url)} propertyHref={propertyHref} />
    </>
  );
}
