import type { Metadata } from "next";
import Link from "next/link";
import { sitePath } from "@/lib/site/paths";
import { SITE_CATEGORIES, type SiteCategory } from "@/lib/site/content";
import { ArrowRight } from "../_components/icons";

export const metadata: Metadata = { title: "Current Properties" };

// Current Properties: one large photo tile per category. The photos are the
// category documents' images from the old CMS.

const TILES: { category: SiteCategory; img: string; alt: string }[] = [
  { category: "office", img: "/site/img/36cde9b65641ca5580ae4f317e43d62d2634b83c.webp", alt: "office building" },
  { category: "retail", img: "/site/img/9dc023bfe7f4d99bb4d539fbbd6fcafd6ea7c846.webp", alt: "shopping center with philadelphia skyline in the back" },
  { category: "residential", img: "/site/img/da2db392a5dac683be8ccb04dd3d17ff921bc791.webp", alt: "interior residential building apartment" },
  { category: "land", img: "/site/img/e823dcfe7b08ee6f44efcb8bdb8142e0081af438.webp", alt: "land aerial" },
];

const FILL: React.CSSProperties = { position: "absolute", height: "100%", width: "100%", left: 0, top: 0, right: 0, bottom: 0 };

export default function CurrentPropertiesPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <section className="bg-white py-16 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-start gap-0">
            <div className="bg-slate-800 h-1 w-16 mb-4" />
            <h1 className="text-5xl md:text-6xl font-light text-slate-800 leading-tight">Current Properties</h1>
          </div>
        </div>
      </section>
      <section className="py-0 bg-slate-50 flex-grow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 shadow-lg">
          {TILES.map((t) => {
            const title = SITE_CATEGORIES[t.category].title;
            return (
              <Link key={t.category} className="group block overflow-hidden bg-white transition-shadow duration-300" href={sitePath(`/${t.category}`)}>
                <div className="relative h-[400px] md:h-[450px] lg:h-[550px] overflow-hidden">
                  <img alt={t.alt} loading="lazy" src={t.img} className="object-cover transition-transform duration-700 group-hover:scale-105" style={FILL} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <div className="absolute top-0 left-0 p-8">
                    <h2 className="text-3xl font-medium text-white mb-2">{title}</h2>
                  </div>
                  <div className="absolute bottom-0 left-0 p-8">
                    <div className="flex items-center text-white font-medium group-hover:text-slate-200 transition-colors">
                      Explore {title} Properties
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
