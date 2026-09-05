"use client";

// HTML sibling of ChartTooltip — the same considered, styled hover card for
// inline/table elements (an amber occupancy chip, a data cell with a breakdown,
// a pill) rather than SVG charts. Renders through a portal so it's never clipped
// by table/card overflow, and flips above/below the trigger to stay on-screen.
//
// Use this (not a native `title=`) whenever a hover conveys real data worth
// reading — a title + labeled rows + an optional footer/delta line.

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TipRow = { label: string; value: string; color?: string };

export function HoverCard({
  children, title, rows, footer, width = 260, help = true, style,
}: {
  children: React.ReactNode;
  title?: string;
  rows: TipRow[];
  footer?: TipRow;
  width?: number;
  /** Show a help cursor on the trigger. */
  help?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); };
  const hide = () => setRect(null);

  // Prefer above the trigger; flip below when there isn't room near the top.
  const below = rect ? rect.top < 200 : false;
  const cx = rect ? Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), (typeof window !== "undefined" ? window.innerWidth : 1200) - width / 2 - 8) : 0;

  return (
    <span ref={ref} onMouseEnter={show} onMouseMove={show} onMouseLeave={hide} style={{ ...(help ? { cursor: "help" } : null), ...style }}>
      {children}
      {rect && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed", zIndex: 3000, pointerEvents: "none", width,
            left: cx, top: below ? rect.bottom + 8 : rect.top - 8,
            transform: `translate(-50%, ${below ? "0" : "-100%"})`,
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 6px 20px rgba(15,23,42,0.20)", padding: "10px 12px",
            font: "inherit", color: "var(--text)",
          }}
        >
          {title && <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: rows.length ? 8 : 0 }}>{title}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {rows.map((r, k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                {r.color && <span style={{ width: 9, height: 9, borderRadius: 999, background: r.color, flex: "0 0 auto" }} />}
                <span style={{ color: "var(--muted)" }}>{r.label}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
              </div>
            ))}
          </div>
          {footer && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)" }}>{footer.label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: footer.color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>{footer.value}</span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
