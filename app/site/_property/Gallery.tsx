"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "../_components/icons";
import type { SiteImage } from "@/lib/site/content";
import { FILL } from "./shared";

/** The property page's 21:9 photo carousel: cross-fading slides, arrows and a
 *  counter (arrows and counter only with more than one photo). */
export default function Gallery({ images, name }: { images: SiteImage[]; name: string }) {
  const [i, setI] = useState(0);
  const n = images.length;
  if (n === 0) return null;
  return (
    <section className="w-full">
      <div className="w-full">
        <div className="relative aspect-[21/9] overflow-hidden bg-slate-200">
          {images.map((img, k) => (
            <div key={k}
              className={`absolute inset-0 transition-opacity duration-500 ${k === i ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
              <img src={img.url} alt={img.alt || `${name} - Image ${k + 1}`} style={FILL} className="object-cover"
                loading={k === 0 ? "eager" : "lazy"} decoding="async" />
            </div>
          ))}
          {n > 1 && (
            <>
              <button onClick={() => setI((x) => (x === 0 ? n - 1 : x - 1))} aria-label="Previous image"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 p-2 rounded-full shadow-md transition-all duration-300 z-10">
                <ChevronLeft className="lucide lucide-chevron-left h-5 w-5" />
              </button>
              <button onClick={() => setI((x) => (x === n - 1 ? 0 : x + 1))} aria-label="Next image"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 p-2 rounded-full shadow-md transition-all duration-300 z-10">
                <ChevronRight className="lucide lucide-chevron-right h-5 w-5" />
              </button>
              <div className="absolute bottom-4 right-4 bg-black/60 text-white text-sm px-3 py-1 rounded-full z-10">{`${i + 1} / ${n}`}</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
