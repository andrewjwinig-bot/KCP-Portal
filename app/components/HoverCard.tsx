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
  children, title, rows, footer, width = 280, help = true, style, body,
}: {
  children: React.ReactNode;
  title?: string;
  rows: TipRow[];
  /** Richer content than label/value rows (a small table), below the rows. */
  body?: React.ReactNode;
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
        <TipCard
          title={title} rows={rows} body={body} footer={footer} width={width}
          style={{
            position: "fixed", zIndex: 3000,
            left: cx, top: below ? rect.bottom + 8 : rect.top - 8,
            transform: `translate(-50%, ${below ? "0" : "-100%"})`,
          }}
        />,
        document.body,
      )}
    </span>
  );
}

/** At most this many rows are listed; the rest read "+ n more" — a hover is a
 *  glance, and a list past ten is a table that belongs on the page (owner:
 *  "some of them have way too much info and its so busy"). */
export const TIP_MAX_ROWS = 10;

/** The card itself — title, rows, optional body and footer — for a caller that
 *  places it (an SVG plan tracking the mouse) rather than wrapping a trigger.
 *  Same language as the plan hovers (PlanTip): the title big and bold, the
 *  values bold and readable, one rule before the footer. */
export function TipCard({ title, rows, body, footer, width = 280, style }: {
  title?: string; rows: TipRow[]; body?: React.ReactNode; footer?: TipRow; width?: number; style?: React.CSSProperties;
}) {
  const shown = rows.length > TIP_MAX_ROWS ? rows.slice(0, TIP_MAX_ROWS - 1) : rows;
  const more = rows.length - shown.length;
  return (
    <div
      role="tooltip"
      style={{
        pointerEvents: "none", width,
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "0 10px 30px rgba(15,23,42,0.22)", padding: "12px 14px",
        font: "inherit", color: "var(--text)",
        ...style,
      }}
    >
      {title && <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25, marginBottom: shown.length || body ? 9 : 0 }}>{title}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((r, k) => (
          <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13 }}>
            {r.color && <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color, flex: "0 0 auto", alignSelf: "center" }} />}
            <span style={{ color: "var(--muted)", minWidth: 0 }}>{r.label}</span>
            <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 13.5, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{r.value}</span>
          </div>
        ))}
        {more > 0 && <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>+ {more} more</div>}
      </div>
      {body}
      {footer && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--border)" }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{footer.label}</span>
          <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 15, color: footer.color ?? "var(--text)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{footer.value}</span>
        </div>
      )}
    </div>
  );
}
