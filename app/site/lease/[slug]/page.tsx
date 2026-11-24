import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_PROPERTIES } from "@/lib/site/content";
import { LANDINGS, landingBySlug, landingListings, landingPath } from "@/lib/site/landings";
import { liveSiteListings } from "@/lib/site/liveListings";
import { sitePath } from "@/lib/site/paths";
import { breadcrumbLd, ldJson, pageMeta } from "@/lib/site/seo";
import { spaceSize, withPropertyInfo } from "@/lib/site/spaces";
import { FILL } from "../../_property/shared";
import ListingsTable from "../../_property/ListingsTable";

// A SEARCH LANDING PAGE (lib/site/landings.ts): written for one search, with
// the live spaces that answer it. Re-read every five minutes, like Available Space.

export const revalidate = 300;
export const dynamicParams = false;
export function generateStaticParams() {
  return LANDINGS.map((l) => ({ slug: l.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = landingBySlug(params.slug);
  if (!page) return {};
  return pageMeta({ absoluteTitle: page.title, description: page.description, path: landingPath(page), image: page.image });
}

export default async function LandingPage({ params }: { params: { slug: string } }) {
  const page = landingBySlug(params.slug);
  if (!page) notFound();
  const listings = landingListings(page, withPropertyInfo(await liveSiteListings(), SITE_PROPERTIES));
  const sf = listings.reduce((a, l) => a + spaceSize(l), 0);
  const props = new Set(listings.map((l) => l.property)).size;
  const others = LANDINGS.filter((l) => l.slug !== page.slug);
  const ld = [
    breadcrumbLd([{ name: "Home", url: "/" }, { name: "Available Space", url: "/available-space" }, { name: page.h1, url: landingPath(page).replace(/^\/site/, "") }]),
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      {ld.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(d) }} />)}
      <section className="lp-hero">
        <img src={page.image} alt="" style={FILL} className="object-cover" />
        <div className="lp-hero-shade" />
        <div className="lp-hero-text">
          <div className="container mx-auto px-4 lp-hero-inner">
            <h1 className="text-4xl md:text-5xl font-light text-white leading-tight max-w-4xl">{page.h1}</h1>
            <p className="lp-hero-sub">
              {listings.length
                ? `${listings.length} ${listings.length === 1 ? "space" : "spaces"} available now${sf ? ` · ${sf.toLocaleString("en-US")} SF` : ""}${props > 1 ? ` across ${props} properties` : ""}`
                : "Nothing available right now — tell us what you need below"}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-10 max-w-4xl" style={{ marginLeft: "auto", marginRight: "auto" }}>
          {page.intro.map((p, i) => <p key={i} className="text-lg text-slate-700 leading-relaxed mb-4">{p}</p>)}
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {listings.length ? (
              <ListingsTable listings={listings} hidePropertyHeaders={!!page.maxSf} />
            ) : (
              <div className="as-empty text-slate-600">
                No space matches right now. <a href={sitePath("/available-space")} className="as-link">See everything available</a> or{" "}
                <a href={sitePath("/contact")} className="as-link">tell us what you need</a>.
              </div>
            )}

            <div className="lp-cols">
              <div>
                <h2 className="text-3xl font-light text-slate-800 mb-6">Questions</h2>
                <dl className="lp-faq">
                  {page.faq.map((f) => (
                    <div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>
                  ))}
                </dl>
              </div>
              <div>
                <h2 className="text-3xl font-light text-slate-800 mb-6">Other searches</h2>
                <ul className="lp-links">
                  {others.map((o) => <li key={o.slug}><a href={landingPath(o)}>{o.h1}</a></li>)}
                  <li><a href={sitePath("/available-space")}>All available space</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
