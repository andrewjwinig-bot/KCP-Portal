"use client";

import { useEffect, useState } from "react";
import { siteAsset } from "@/lib/site/paths";
import { useSiteLoading } from "../_components/SiteLoading";

// The home page's first-visit splash: the logo on navy, gently pulsing with a
// line sweeping under it, for at least 1.5 s while the hero photo loads, then
// fading out. Skipped when the visitor has already been inside the site this
// session — as the original's AdvancedPageLoader did.

export default function HomeLoader({ preload, children }: { preload: string; children: React.ReactNode }) {
  const [showing, setShowing] = useState(true);
  const [mounted, setMounted] = useState(true);
  const { setIsLoading, setLoaderPresent } = useSiteLoading();

  useEffect(() => {
    setLoaderPresent(true);
    let skip = false;
    try {
      if (sessionStorage.getItem("hasVisitedAnyPage") === "true" || sessionStorage.getItem("hasVisitedHomepage") === "true") skip = true;
      else sessionStorage.setItem("hasVisitedHomepage", "true");
    } catch { /* private mode: show it */ }
    const done = () => { setShowing(false); setIsLoading(false); setTimeout(() => setMounted(false), 800); };
    if (skip) { setShowing(false); setMounted(false); setIsLoading(false); return; }
    const started = Date.now();
    const finish = () => { const wait = Math.max(0, 1500 - (Date.now() - started)); setTimeout(done, wait); };
    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = preload;
    return () => { img.onload = null; img.onerror = null; };
  }, [preload, setIsLoading, setLoaderPresent]);

  return (
    <>
      {mounted && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900"
          style={{ opacity: showing ? 1 : 0, transition: "opacity .8s ease-in-out" }}
        >
          <div className="flex flex-col items-center kcs-rise">
            <div className="mb-10">
              <div className="relative">
                <div className="text-white kcs-pulse">
                  <img src={siteAsset("images/Korman_CORPORATE_logo_WHT.png")} alt="Korman Commercial" className="kcs-splash-logo" />
                </div>
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 h-[1px] bg-white/40 kcs-sweep" />
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ opacity: showing && mounted ? 0 : 1, transition: "opacity .5s ease .2s" }}>{children}</div>
    </>
  );
}
