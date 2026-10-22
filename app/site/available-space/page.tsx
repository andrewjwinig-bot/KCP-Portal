import type { Metadata } from "next";
import { AVAILABLE_SPACE_PAGE, SITE_LISTINGS, SITE_PROPERTIES } from "@/lib/site/content";
import ListingsTable from "../_property/ListingsTable";

// Every availability across the portfolio, a table per property in
// alphabetical order — the vendor site's /available-space.

export const metadata: Metadata = {
  title: "Available Office Space",
  description: "Browse our available office space for lease at Korman Commercial Properties.",
};

export default function AvailableSpacePage() {
  const nameOf = new Map(SITE_PROPERTIES.map((p) => [p.slug, p.name]));
  const listings = SITE_LISTINGS.map((l) => ({ ...l, propertyName: nameOf.get(l.property) ?? "Other Properties" }));
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
            <ListingsTable listings={listings} />
          </div>
        </div>
      </section>
    </main>
  );
}
