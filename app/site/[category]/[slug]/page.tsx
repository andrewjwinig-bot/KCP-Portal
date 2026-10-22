import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_CATEGORIES, SITE_PROPERTIES, listingsFor, propertyBySlug, type SiteProperty } from "@/lib/site/content";
import { sitePath } from "@/lib/site/paths";
import { ChevronLeft, ExternalLink } from "../../_components/icons";
import Gallery from "../../_property/Gallery";
import ListingsTable from "../../_property/ListingsTable";
import { PortableText } from "../../_property/shared";

// A property page, as the vendor site built it: a back bar, the photo
// carousel, a title band, the description beside the facts table, Features
// and Amenities on office properties, AVAILABLE SPACE, the site plan, and a
// map (not on residential).

export const dynamicParams = false;
export function generateStaticParams() {
  return SITE_PROPERTIES.map((p) => ({ category: p.category, slug: p.slug }));
}

export function generateMetadata({ params }: { params: { category: string; slug: string } }): Metadata {
  const p = propertyBySlug(params.category, params.slug);
  if (!p) return {};
  const description = `View details and information about ${p.name} in ${p.city}, ${p.state}.`;
  return {
    title: p.name,
    description,
    openGraph: { title: p.name, description, images: p.mainImage ? [p.mainImage] : undefined },
  };
}

/** The amenities the original listed on every office property. */
const OFFICE_AMENITIES = [
  "24 Hour Access", "Bus Line", "Conference Rooms", "Day Care", "Fitness Center", "Food Truck Program",
  "Landscaped Courtyards", "Property Manager on Site", "Security System", "Car Charging Station", "Walking Trails",
];

const BUTTON =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none shadow-xs h-9 px-4 py-2 has-[>svg]:px-3 bg-slate-800 hover:bg-slate-700 text-white mt-4";

function Fact({ label, children, first }: { label: React.ReactNode; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`py-4 ${first ? "first:pt-0 first:pb-4 " : ""}grid grid-cols-[1fr,3fr]`}>
      <div className="text-sm font-medium text-gray-500 uppercase">{label}</div>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  );
}

function Facts({ p }: { p: SiteProperty }) {
  const residential = p.category === "residential";
  const inquiry = p.leasingInquiryName || p.leasingInquiryPhone || p.leasingInquiryEmail;
  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-1 divide-y divide-gray-200">
        {!residential && <Fact label="ADDRESS" first>{p.address}</Fact>}
        {residential && p.units && <Fact label="UNITS">{p.units}</Fact>}
        {residential && p.beds && <Fact label="BEDS">{p.beds}</Fact>}
        {residential && p.baths && <Fact label="BATHS">{p.baths}</Fact>}
        {p.acres && <Fact label="ACRES">{p.acres}</Fact>}
        {p.gla && !residential && <Fact label="GLA">{p.gla}</Fact>}
        {p.keyTenants && <Fact label="KEY TENANTS">{p.keyTenants}</Fact>}
        {inquiry && (
          <div className="py-4 grid grid-cols-[1fr,3fr]">
            <div className="text-sm font-medium text-gray-500 uppercase xl:whitespace-nowrap max-xl:leading-tight">
              LEASE<span className="xl:hidden"><br /></span> INQUIRY
            </div>
            <div className="text-sm text-gray-900">
              {p.leasingInquiryName && <>{p.leasingInquiryName}<br /></>}
              {p.leasingInquiryPhone && <>{p.leasingInquiryPhone}<br /></>}
              {p.leasingInquiryEmail}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PropertyPage({ params }: { params: { category: string; slug: string } }) {
  const p = propertyBySlug(params.category, params.slug);
  if (!p) notFound();
  const category = SITE_CATEGORIES[p.category];
  const images = [...(p.mainImage ? [{ url: p.mainImage, alt: p.mainImageAlt || p.name }] : []), ...(p.gallery ?? [])];
  // "$0/SF/YR" is how the CMS said "ask us".
  const listings = listingsFor(p.slug).map((l) => ({
    ...l,
    propertyName: p.name,
    rentalRate: l.rentalRate === "$0.00/SF/YR" || l.rentalRate === "$0/SF/YR" ? "Upon Request" : l.rentalRate,
  }));

  return (
    <div className="office-layout">
      <main className="min-h-screen">
        <div className="w-full bg-slate-800 text-white py-3">
          <div className="container mx-auto px-4">
            <a href={sitePath(`/${p.category}`)} className="flex items-center group max-w-fit">
              <ChevronLeft className="lucide lucide-chevron-left h-5 w-5 mr-2 group-hover:transform group-hover:-translate-x-1 transition-transform duration-200" />
              <span className="font-medium">Back to {category.title}</span>
            </a>
          </div>
        </div>

        <Gallery images={images} name={p.name} />

        <section className="py-4 bg-slate-800 text-white">
          <div className="container mx-auto px-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl md:text-4xl font-medium">{p.name}</h1>
              <p className="text-sm md:text-md text-slate-300">{p.city}, {p.state}</p>
            </div>
          </div>
        </section>

        <section className="py-8 bg-white">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] lg:gap-32">
              <div>
                {p.body && p.body.length > 0 && (
                  <div className="prose prose-slate max-w-none mb-0"><PortableText value={p.body} variant="property" /></div>
                )}
                <div className="mt-2">
                  {p.externalLink && (
                    <a href={p.externalLink} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                      View Listing<ExternalLink className="lucide lucide-external-link ml-2 h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-8 lg:mt-0"><Facts p={p} /></div>
            </div>

            {p.category === "office" ? (
              <section className="pt-10 pb-12 px-0">
                <div className="container mx-auto px-0">
                  <h3 className="text-lg font-medium text-slate-700 mb-4">Features and Amenities</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-4 gap-x-8">
                    {OFFICE_AMENITIES.map((a) => (
                      <div key={a} className="flex items-center">
                        <div className="w-1.5 h-1.5 rounded-full mr-3 bg-slate-800" />
                        <span className="text-sm text-slate-700">{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <div className="py-6" />
            )}

            {listings.length > 0 && (
              <div className="mt-0 mb-12 pt-0 ">
                <div className="mt-0 pt-0">
                  <ListingsTable listings={listings} title="AVAILABLE SPACE" hidePropertyHeaders inlineControls showRentType={false} />
                </div>
              </div>
            )}

            {p.sitePlan && (
              <div className="mt-0 pt-0">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-light text-slate-800">SITE PLAN</h2>
                </div>
                <div className="overflow-hidden mt-6">
                  <div className="relative aspect-[16/9]">
                    <img src={p.sitePlan.url} alt={p.sitePlan.alt || "Property Site Plan"} loading="lazy" decoding="async"
                      className="object-contain" style={{ position: "absolute", height: "100%", width: "100%", inset: 0 }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {p.coordinates && p.category !== "residential" && (
          <section className="w-full relative" style={{ marginBottom: "-1px" }}>
            <div className="h-[60vh] md:h-[60vh] w-full overflow-hidden">
              {/* The original drew a styled Google Map through its own API key;
                  the keyless embed shows the same place without one. */}
              <iframe
                title={`Map showing location of ${p.name}`}
                src={`https://www.google.com/maps?q=${p.coordinates.lat},${p.coordinates.lng}&z=13&output=embed`}
                className="w-full h-full"
                style={{ border: 0, display: "block" }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
