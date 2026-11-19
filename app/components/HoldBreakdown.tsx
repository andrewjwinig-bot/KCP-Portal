"use client";

// HOLD TO SEE THE PARTS (owner, 11/2026: "on an extended hover can you like
// expand to show the bar charts of the supplemental buildings/properties …
// that would be a cool thing to integrate in other areas … where they are
// rolled up by category"). Passed as a `HoverCard`'s `body`: the hover opens as
// the usual glance, and after a beat of holding it grows into one small bar per
// part (each building in a category, each line in a group). A glance first,
// the detail when someone stays — so the hover stays light for a quick look.
//
// Use it wherever a figure is a ROLL-UP of parts; keep the parts the same
// figures the roll-up sums, so the bars add back to the hover's total.

import { useEffect, useState } from "react";

export type BreakdownPart = {
  key: string;
  /** A code shown first, as the portal writes codes (a property, a unit). */
  code?: string;
  label: string;
  /** 0–100: how full the bar is drawn (an occupancy %, a share of the total). */
  pct: number;
  /** What the row says at its right — "92%", "$1.2M". */
  value: string;
  /** The bar's colour (defaults to brand navy). */
  color?: string;
};

export const HOLD_MS = 700;

export function HoldBreakdown({ parts, hint = "Keep holding for each one…" }: { parts: BreakdownPart[]; hint?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOpen(true), HOLD_MS); return () => clearTimeout(t); }, []);
  if (!parts.length) return null;
  if (!open) return <div style={{ fontSize: "var(--fs-12)", color: "var(--muted)", marginTop: 6 }}>{hint}</div>;
  return (
    <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
      {parts.map((p) => (
        <div key={p.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 56px", alignItems: "center", gap: 8, fontSize: "var(--fs-12)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.code && <code>{p.code}</code>} {p.label}</span>
          <span style={{ height: 8, borderRadius: 4, background: "var(--tint-neutral-bg, rgba(15,23,42,0.07))", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, p.pct))}%`, background: p.color ?? "var(--c-0b4a7d)" }} />
          </span>
          <span style={{ textAlign: "right", fontWeight: 700, color: p.color ?? "var(--text)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}
