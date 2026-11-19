import type { Metadata } from "next";
import { AVAILABLE_SPACE_PAGE, SITE_PROPERTIES } from "@/lib/site/content";
import { liveSiteListings } from "@/lib/site/liveListings";
import AvailableSpaceExplorer from "./AvailableSpaceExplorer";

// Every availability across the portfolio, a table per property in
// alphabetical order — the vendor site's /available-space.

// Every space is the portal's, live (liveListings.ts): the designed centres'
// synced suites, and every other property's vacancies on the CURRENT rent roll
// (rollListings.ts). Re-read every five minutes so an import reaches the
// website on its own. Filter / sort: AvailableSpaceExplorer.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Available Space",
  description: "Office and retail space for lease at Korman Commercial Properties — every vacancy, live from our rent roll, filterable by type, property and size.",
};

export default async function AvailableSpacePage() {
  const bySlug = new Map(SITE_PROPERTIES.map((p) => [p.slug, p]));
  const listings = (await liveSiteListings()).map((l) => {
    const p = bySlug.get(l.property);
    return { ...l, propertyName: p?.name ?? "Other Properties", category: p?.category ?? "other", city: p?.city ?? null };
  });
  const title = AVAILABLE_SPACE_PAGE.title || "Available Space";

  return (
    <main className="min-h-screen">
      <section className="bg-white py-16 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-start gap-2">
            <div className="bg-slate-800 h-1 w-16 mb-4" />
            <h1 className="text-5xl md:text-6xl font-light text-slate-800 leading-tight">{title}</h1>
          </div>
        </div>
      </section>
      <section className="py-16 bg-slate-50 border-t border-slate-100">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {AVAILABLE_SPACE_PAGE.description && <p className="text-slate-600 mb-6">{AVAILABLE_SPACE_PAGE.description}</p>}
            <AvailableSpaceExplorer listings={listings} />
          </div>
        </div>
      </section>
    </main>
  );
}
