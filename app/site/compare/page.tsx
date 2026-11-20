import type { Metadata } from "next";
import { SITE_PROPERTIES } from "@/lib/site/content";
import { liveSiteListings } from "@/lib/site/liveListings";
import { sitePath } from "@/lib/site/paths";
import { COMPARE_MAX, spaceSlug, withPropertyInfo } from "@/lib/site/spaces";
import CompareView from "./CompareView";

// COMPARE UP TO THREE SPACES side by side (owner, 11/2026). The picks ride in
// the URL (?spaces=a,b,c — compare.tsx builds it) so a comparison can be sent;
// a space that has since leased is said to be gone, not silently dropped. A
// shortlist is a visitor's own view — never indexed.

export const revalidate = 300;
export const metadata: Metadata = { title: "Compare Spaces", robots: { index: false, follow: true } };

export default async function ComparePage({ searchParams }: { searchParams: { spaces?: string } }) {
  const wanted = (searchParams.spaces ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, COMPARE_MAX);
  const all = withPropertyInfo(await liveSiteListings(), SITE_PROPERTIES);
  const found = wanted.map((slug) => ({ slug, l: all.find((x) => spaceSlug(x) === slug) ?? null }));
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="bg-white py-12 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="bg-slate-800 h-1 w-16 mb-4" />
          <h1 className="text-5xl font-light text-slate-800">Compare Spaces</h1>
          <p className="text-slate-600 mt-3">
            Up to {COMPARE_MAX} spaces side by side. <a href={sitePath("/available-space")} className="as-link">Back to available space</a>
          </p>
        </div>
      </section>
      <CompareView found={found} />
    </main>
  );
}
