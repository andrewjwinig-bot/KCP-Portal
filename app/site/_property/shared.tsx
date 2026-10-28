// Small pieces the category, property and available-space pages share.
// Server-safe (no hooks).

import type { CSSProperties, ReactNode } from "react";
import type { PortableBlock, SiteCategory, SiteProperty } from "@/lib/site/content";
import { propertyPath, sitePath } from "@/lib/site/paths";

/** next/image's `fill` layout, which the original used for every photo. */
export const FILL: CSSProperties = { position: "absolute", height: "100%", width: "100%", inset: 0, color: "transparent" };

/** The CMS's display order: by `displayOrder`, a missing order reading as 0
 *  (the original's comparator tested `!== undefined`, so `null` sorted first),
 *  ties kept in list order. */
export function inDisplayOrder<T extends { displayOrder: number | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

type Variant = "property" | "category";

const P_CLASS: Record<Variant, string> = {
  property: "mb-0 leading-relaxed text-base",
  category: "text-lg text-slate-600 leading-relaxed mb-4",
};

function spans(block: PortableBlock): ReactNode[] {
  const defs = block.markDefs ?? [];
  return block.children.map((s, i) => {
    let node: ReactNode = s.text;
    for (const m of s.marks ?? []) {
      if (m === "strong") node = <strong className="font-semibold">{node}</strong>;
      else if (m === "em") node = <em className="italic">{node}</em>;
      else {
        const def = defs.find((d) => d._key === m);
        if (def?.href) {
          const external = !def.href.startsWith("/") && !def.href.startsWith("#");
          node = (
            <a href={def.href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
              className="text-blue-600 hover:underline transition-colors">{node}</a>
          );
        }
      }
    }
    return <span key={i}>{node}</span>;
  });
}

/** The CMS's portable text, rendered with the original's components. */
export function PortableText({ value, variant }: { value: PortableBlock[]; variant: Variant }) {
  const out: ReactNode[] = [];
  let list: { kind: string; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const cls = `${list.kind === "number" ? "list-decimal" : "list-disc"} pl-6 my-4 space-y-2${variant === "category" ? " text-lg text-slate-600 leading-relaxed" : ""}`;
    out.push(list.kind === "number" ? <ol key={out.length} className={cls}>{list.items}</ol> : <ul key={out.length} className={cls}>{list.items}</ul>);
    list = null;
  };
  value.forEach((b, i) => {
    if (b.listItem) {
      if (!list || list.kind !== b.listItem) { flush(); list = { kind: b.listItem, items: [] }; }
      list.items.push(<li key={i} className="mb-1">{spans(b)}</li>);
      return;
    }
    flush();
    if (b.style === "h4") out.push(<h4 key={i} className="text-xl font-semibold mt-5 mb-2">{spans(b)}</h4>);
    else if (b.style === "blockquote") out.push(<blockquote key={i} className="border-l-4 border-slate-300 pl-4 italic my-5 text-slate-600">{spans(b)}</blockquote>);
    else out.push(<p key={i} className={P_CLASS[variant]}>{spans(b)}</p>);
  });
  flush();
  return <>{out}</>;
}

/** The photo tiles at the foot of a category page: the other three categories. */
const BAND: { slug: SiteCategory; title: string; img: string; alt: string }[] = [
  { slug: "office", title: "Office", img: "/site/img/36cde9b65641ca5580ae4f317e43d62d2634b83c.webp", alt: "office building" },
  { slug: "retail", title: "Retail", img: "/site/img/9dc023bfe7f4d99bb4d539fbbd6fcafd6ea7c846.webp", alt: "shopping center with philadelphia skyline in the back" },
  { slug: "residential", title: "Residential", img: "/site/img/da2db392a5dac683be8ccb04dd3d17ff921bc791.webp", alt: "interior residential building apartment" },
  { slug: "land", title: "Land", img: "/site/img/e823dcfe7b08ee6f44efcb8bdb8142e0081af438.webp", alt: "land aerial" },
];

export function OtherCategoriesBand({ current }: { current: SiteCategory }) {
  return (
    <section className="w-full relative mb-8 md:mb-12" style={{ marginBottom: "-1px" }}>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {BAND.filter((b) => b.slug !== current).map((b) => (
          <div key={b.slug} className="relative">
            <a className="group block relative h-[50vh] md:h-[50vh] overflow-hidden" href={sitePath(`/${b.slug}`)}>
              <div className="absolute inset-0 w-full h-full">
                <img alt={b.alt} src={b.img} loading="lazy" decoding="async" style={FILL}
                  className="object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent flex flex-col items-center justify-center">
                <h3 className="text-2xl md:text-3xl font-semibold text-white tracking-wider text-center uppercase">{b.title}</h3>
                <div className="w-12 h-0.5 bg-white/70 mt-3" />
              </div>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One property card on a category page. */
export function PropertyCard({ p }: { p: SiteProperty }) {
  return (
    <a href={propertyPath(p.category, p.slug)}
      className="block overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.3)] transition-all duration-300 group">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img alt={p.mainImageAlt || p.name} src={p.mainImage || ""} loading="lazy" decoding="async" style={FILL}
          className="object-cover transition-all duration-500 group-hover:brightness-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent">
          <div className="absolute bottom-0 left-0 p-4">
            <h3 className="text-xl font-light text-white">{p.name}</h3>
          </div>
        </div>
      </div>
    </a>
  );
}
