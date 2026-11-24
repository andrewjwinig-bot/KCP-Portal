"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE_BASE } from "@/lib/site/paths";

// The original site's LoadingProvider + PageVisitTracker. The header stays
// hidden while a page's loader (the home page's splash) is up; on any other
// page it appears after 200 ms, as it did.

type Loading = { isLoading: boolean; setIsLoading: (v: boolean) => void; setLoaderPresent: (v: boolean) => void };
const Ctx = createContext<Loading | undefined>(undefined);

export function SiteLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [loaderPresent, setLoaderPresent] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const t = setTimeout(() => { if (!loaderPresent) setIsLoading(false); }, 200);
    const failsafe = setTimeout(() => { if (!loaderPresent) setIsLoading(false); }, 1000);
    return () => { clearTimeout(t); clearTimeout(failsafe); };
  }, [loaderPresent]);

  // Remember that the visitor has been inside the site, so coming back to the
  // home page does not replay the splash.
  useEffect(() => {
    if (pathname !== SITE_BASE) {
      try { sessionStorage.setItem("hasVisitedAnyPage", "true"); } catch { /* private mode */ }
    }
  }, [pathname]);

  return <Ctx.Provider value={{ isLoading, setIsLoading, setLoaderPresent }}>{children}</Ctx.Provider>;
}

export function useSiteLoading(): Loading {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSiteLoading must be used inside SiteLoadingProvider");
  return v;
}
