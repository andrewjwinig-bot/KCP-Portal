"use client";
// An ⓘ button that opens the Skyline import steps in a small popover — the
// steps stay one click away instead of filling the page. Shared by the CAM
// recon's year-end exports, Receipt Reconciliation and Open Credits.
//
// The panel is placed from the button's own position and CLAMPED INSIDE THE
// WINDOW (portal-rendered, fixed) — anchored to one side, a button near the
// right edge pushed the steps off the screen. `align` is only a preference.

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const WIDTH = 400;
const GAP = 8;
const MARGIN = 12;

export function InfoPopover({ children, label = "Skyline import steps", align = "right" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - MARGIN * 2);
      // Preferred edge, then clamped so the whole panel is on screen.
      let left = align === "right" ? b.right - width : b.left;
      left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
      const h = panel.current?.offsetHeight ?? 0;
      let top = b.bottom + GAP;
      if (h && top + h > vh - MARGIN && b.top - GAP - h >= MARGIN) top = b.top - GAP - h; // flip above
      setPos({ top, left, width });
    };
    place();
    const raf = requestAnimationFrame(place); // once the panel has a height
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, align]);

  return (
    <span style={{ display: "inline-flex" }}>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open} title={label}
        style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        <Info size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1100 }} />
          <div ref={panel} role="dialog" aria-label={label}
            style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? WIDTH, maxHeight: "80vh", overflowY: "auto", zIndex: 1101, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "4px 16px 14px", boxShadow: "var(--shadow-pop, 0 10px 30px rgba(0,0,0,0.15))" }}>
            {children}
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
