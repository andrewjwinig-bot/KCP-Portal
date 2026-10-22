import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_CATEGORIES, propertiesIn, type SiteCategory, type SiteProperty } from "@/lib/site/content";
import { OtherCategoriesBand, PortableText, PropertyCard, inDisplayOrder } from "../_property/shared";

// A category page (Retail / Office / Residential / Land): a title band, the
// property cards — grouped under a heading per subcategory where the CMS gives
// one (Retail's Shopping Centers / Single-Tenant Retail) — and the other three
// categories as photo tiles at the foot. As the vendor site laid it out.

const CATEGORIES = Object.keys(SITE_CATEGORIES) as SiteCategory[];
const isCategory = (c: string): c is SiteCategory => (CATEGORIES as string[]).includes(c);

export const dynamicParams = false;
export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export function generateMetadata({ params }: { params: { category: string } }): Metadata {
  if (!isCategory(params.category)) return {};
  return { title: SITE_CATEGORIES[params.category].title };
}

function Group({ title, properties }: { title?: string; properties: SiteProperty[] }) {
  return (
    <>
      {title && (
        <div className="mb-8">
          <div className="bg-slate-700 h-0.5 w-12 mb-3" />
          <h2 className="text-3xl font-light text-slate-800 leading-tight">{title}</h2>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {properties.map((p) => <PropertyCard key={p.id} p={p} />)}
      </div>
    </>
  );
}

export default function CategoryPage({ params }: { params: { category: string } }) {
  if (!isCategory(params.category)) notFound();
  const cat = SITE_CATEGORIES[params.category];
  const all = propertiesIn(params.category);

  // Subcategory groups in the order they first appear; the rest after them.
  const groups: { title: string; properties: SiteProperty[] }[] = [];
  for (const p of all) {
    if (!p.subcategory) continue;
    let g = groups.find((x) => x.title === p.subcategory);
    if (!g) groups.push((g = { title: p.subcategory, properties: [] }));
    g.properties.push(p);
  }
  const ungrouped = inDisplayOrder(all.filter((p) => !p.subcategory));
  const description = Array.isArray(cat.description) && cat.description.length > 0 ? cat.description : null;

  return (
    <div className="office-layout">
      <main className="flex flex-col min-h-0">
        <section className="bg-white py-16 border-b border-slate-100">
          <div className="container mx-auto px-4">
            <div className={`flex flex-col items-start gap-2 ${description ? "mb-12" : ""}`}>
              <div className="bg-slate-800 h-1 w-16 mb-4" />
              <h1 className="text-5xl md:text-6xl font-light text-slate-800 leading-tight">{cat.title}</h1>
            </div>
            {description && <div><PortableText value={description} variant="category" /></div>}
          </div>
        </section>
        <section className="py-10 bg-slate-50">
          <div className="max-w-screen-2xl mx-auto px-10">
            {all.length === 0 ? (
              <div className="text-center py-12 text-slate-600 bg-white rounded-lg shadow-sm border border-slate-100">
                <p>No properties currently listed in this category.</p>
                <p className="mt-2 text-sm">Please check back later or explore other categories.</p>
              </div>
            ) : (
              <>
                {groups.map((g) => (
                  <div key={g.title} className="mb-16">
                    <Group title={g.title} properties={inDisplayOrder(g.properties)} />
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div className={groups.length > 0 ? "mt-8" : ""}>
                    <Group title={groups.length > 0 ? "Other Properties" : undefined} properties={ungrouped} />
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <OtherCategoriesBand current={params.category} />
    </div>
  );
}
