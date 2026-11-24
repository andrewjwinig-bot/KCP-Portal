"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Every plain `title=` hover in the portal, drawn in the master hover style.
 *
 * There are ~200 of them, mostly short action labels ("Download", "Sort by
 * date"). Rather than leave them as the browser's tiny grey tooltip, this
 * listens once for the whole app: hovering anything with a title shows a
 * readable card instead, and the native tooltip is suppressed while it does.
 * Data-bearing hovers should still use HoverCard (title + rows); this is the
 * floor, not a substitute. Only runs under the new look.
 */
export default function TitleTips({ enabled }: { enabled: boolean }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let el: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const restore = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (el && el.dataset.kcpTitle != null) {
        el.setAttribute("title", el.dataset.kcpTitle);
        delete el.dataset.kcpTitle;
      }
      el = null;
      setTip(null);
    };

    const over = (e: MouseEvent) => {
      if (document.documentElement.dataset.skin !== "studio") return;
      const t = (e.target as Element | null)?.closest?.("[title]") as HTMLElement | null;
      if (!t || t === el) return;
      if (t.closest(".kcs")) return;              // the public website draws its own
      if (t instanceof SVGElement && !(t instanceof SVGSVGElement)) return;
      const text = t.getAttribute("title")?.trim();
      if (!text) return;
      restore();
      el = t;
      t.dataset.kcpTitle = t.getAttribute("title") ?? "";
      t.removeAttribute("title");                  // no native tooltip on top
      timer = setTimeout(() => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 90;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, 250);
    };
    const out = (e: MouseEvent) => {
      if (!el) return;
      const to = e.relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      restore();
    };

    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    window.addEventListener("scroll", restore, true);
    document.addEventListener("mousedown", restore, true);
    return () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      window.removeEventListener("scroll", restore, true);
      document.removeEventListener("mousedown", restore, true);
      restore();
    };
  }, [enabled]);

  if (!tip || typeof document === "undefined") return null;
  const W = Math.min(360, window.innerWidth - 16);
  const left = Math.min(Math.max(tip.x, W / 2 + 8), window.innerWidth - W / 2 - 8);
  return createPortal(
    <div role="tooltip" style={{
      position: "fixed", zIndex: 3100, pointerEvents: "none",
      left, top: tip.y, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
      maxWidth: W, width: "max-content",
      background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
      borderRadius: 12, boxShadow: "0 10px 30px rgba(16,24,40,0.18)",
      padding: "10px 14px", fontSize: 16, fontWeight: 600, lineHeight: 1.4, whiteSpace: "pre-line",
    }}>{tip.text}</div>,
    document.body,
  );
}
