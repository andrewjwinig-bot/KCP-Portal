"use client";

import { useEffect, useState } from "react";
import { centerImageSrc } from "../../../lib/centers/registry";

// Hero photo shown as a banner at the top of a shopping-center property's info
// page, so the uploaded marketing hero is actually visible here (not just an
// edit slot in the Public Website card). Uses the uploaded override hero if
// present, otherwise the registry default; served through the /api/center-image
// proxy (private Blob store) via centerImageSrc. Renders nothing if there's no
// hero.

export default function CenterHeroBanner({ code, fallbackHero }: { code: string; fallbackHero?: string }) {
  const [hero, setHero] = useState<string | undefined>(fallbackHero);

  useEffect(() => {
    let alive = true;
    fetch(`/api/centers/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!alive) return;
        const h = cfg?.override?.assets?.hero ?? fallbackHero;
        if (h) setHero(h);
      })
      .catch(() => { /* keep fallback */ });
    return () => { alive = false; };
  }, [code, fallbackHero]);

  const src = centerImageSrc(hero);
  if (!src) return null;

  return (
    <div style={{
      width: "100%", borderRadius: 14, overflow: "hidden",
      aspectRatio: "24 / 7", maxHeight: 300,
      border: "1px solid var(--border)", background: "var(--panel, #f4f6f8)",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
}
