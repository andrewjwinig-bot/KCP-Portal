"use client";

import { useEffect, useState } from "react";
import { siteAsset } from "@/lib/site/paths";

// "Our Company" header: six photos on a 24 × 8 grid that fade in one at a time
// in a random order, with the title fading in over them.

const TILES = [
  { place: "row-start-2 row-span-2 col-start-2 col-span-5", src: "images/completed_projects/trevose_completed.jpg", alt: "Trevose property" },
  { place: "row-start-4 row-span-2 col-start-1 col-span-4", src: "images/completed_projects/neshaminy_completed.jpg", alt: "Neshaminy property", mdOnly: true },
  { place: "row-start-6 row-span-2 col-start-3 col-span-7", src: "images/categories_duplicate/hyman-korman-inc-truck-bw.jpg", alt: "Hyman Korman Inc Truck 1919", pos: "object-left" },
  { place: "row-start-2 row-span-4 col-start-20 col-span-5", src: "images/categories_duplicate/Neshaminy-Mall-Totem.jpg", alt: "Neshaminy Mall Totem", pos: "object-left", mdOnly: true },
  { place: "row-start-6 row-span-2 col-start-16 col-span-6", src: "images/about-us/8-nesham-aerial.jpg", alt: "Aerial property view" },
  { place: "row-start-2 row-span-2 col-start-17 col-span-3", src: "images/about-us/core-values/residential.jpg", alt: "Residential property detail" },
];

export default function CompanyCollage() {
  const [shown, setShown] = useState<boolean[]>(() => TILES.map(() => false));
  const [title, setTitle] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setTitle(1), 300);
    const order = TILES.map((_, i) => i).sort(() => Math.random() - 0.5);
    const timers = order.map((idx, n) =>
      setTimeout(() => setShown((s) => { const c = [...s]; c[idx] = true; return c; }), 900 + 300 * n),
    );
    return () => { clearTimeout(t); timers.forEach(clearTimeout); };
  }, []);

  return (
    <section className="relative min-h-[65vh] md:min-h-[75vh] lg:min-h-[85vh] bg-white overflow-hidden flex items-center justify-center ">
      <div
        className="relative w-full max-w-screen-xl h-[65vh] md:h-[75vh] lg:h-[85vh] grid gap-2 md:gap-3 lg:gap-4"
        style={{ gridTemplateColumns: "repeat(24, 1fr)", gridTemplateRows: "repeat(8, 1fr)" }}
      >
        {TILES.map((t, i) => (
          <div
            key={t.src}
            className={`${t.place} relative overflow-hidden rounded-md md:rounded-lg shadow-md md:shadow-lg transition-opacity duration-700 ease-in-out ${t.mdOnly ? "hidden md:block" : ""}`}
            style={{ opacity: shown[i] ? 1 : 0 }}
          >
            <img
              src={siteAsset(t.src)}
              alt={t.alt}
              className={`object-cover ${t.pos ?? ""}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          </div>
        ))}
        <div
          className="col-start-8 col-span-10 row-start-4 row-span-2 flex items-center justify-center text-center z-20 pointer-events-none p-4"
          style={{ opacity: title, transition: "opacity 1200ms ease-in-out" }}
        >
          <div className="relative">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal text-slate-800 tracking-tight">Our Company</h1>
            <div className="absolute top-[-2rem] left-1/2 transform -translate-x-1/2 w-16 md:w-24 h-1 bg-slate-800/30" />
          </div>
        </div>
      </div>
    </section>
  );
}
