"use client";

// The plan hover — shared by a suite on a site / floor plan and a building on
// the campus map: the name big and bold, a line under it, a few clear figures,
// and an optional footer under a rule; a colour rail down the left in the
// shape's current colour (owner: "bold and big and clear", like the
// Management Fees hover — no dots).

import React from "react";

/** A figure in the hover: a small label over a big value. `wide` spans both
 *  columns (a long value — "CAM · RET · Other", a legal name). */
export type PlanTipRow = { label: string; value: string; color?: string; strong?: boolean; wide?: boolean };

/** A tile left alone in its row (the next is wide, or it is the last) spans
 *  both columns, so the grid never shows a hole. */
export function fill(rows: PlanTipRow[]): PlanTipRow[] {
  const out: PlanTipRow[] = [];
  let col = 0;
  rows.forEach((r, i) => {
    if (r.wide) { out.push(r); col = 0; return; }
    const next = rows[i + 1];
    const alone = col === 0 && (!next || next.wide);
    out.push(alone ? { ...r, wide: true } : r);
    col = alone ? 0 : (col + 1) % 2;
  });
  return out;
}

export default function PlanTip({ title, subtitle, rows, footer, accent, x, y, width = 380 }: {
  title: string;
  subtitle?: string;
  rows: PlanTipRow[];
  footer?: PlanTipRow | null;
  accent?: string;
  /** The mouse, in viewport pixels. */
  x: number; y: number;
  width?: number;
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = x + 18 + width > vw - 8 ? x - 18 - width : x + 18;
  const top = Math.max(8, Math.min(y + 18, vh - 330));
  return (
    <div role="tooltip" style={{
      position: "fixed", zIndex: 3000, left, top, width, pointerEvents: "none",
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
      boxShadow: "0 10px 30px rgba(15,23,42,0.22)", overflow: "hidden", color: "var(--text)",
      borderLeft: `6px solid ${accent ?? "var(--brand)"}`,
    }}>
      <div style={{ padding: "13px 16px 9px" }}>
        <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3, fontWeight: 600 }}>{subtitle}</div>}
      </div>
      {rows.length > 0 && (
        <div style={{ padding: "2px 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {fill(rows).map((r) => (
            <div key={r.label} style={{
              gridColumn: r.wide ? "1 / -1" : undefined,
              background: "var(--hover, rgba(15,23,42,0.04))", borderRadius: 8, padding: "7px 10px",
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)" }}>{r.label}</div>
              <div style={{ fontSize: r.strong ? 18 : 16, fontWeight: 800, color: r.color ?? "var(--text)", marginTop: 1, lineHeight: 1.2 }}>{r.value}</div>
            </div>
          ))}
        </div>
      )}
      {footer && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "9px 16px 11px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)" }}>{footer.label}</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: footer.color }}>{footer.value}</span>
        </div>
      )}
    </div>
  );
}
