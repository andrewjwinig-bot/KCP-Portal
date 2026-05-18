/**
 * Canonical Pill + Badge primitives.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STYLE GUIDE — read before adding a new page or chip-like component.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Every new admin page should reuse these primitives instead of
 * re-inventing colored chips. Each variant has ONE canonical look:
 *
 *   <Pill tone={...}>label</Pill>
 *     Use for: status tags, priority tags, room tags, "in-house"
 *     tags — anything that classifies a row at a glance.
 *     Shape: 11px / 700, padding 2px 8px, fully rounded.
 *
 *   <Badge>{n}</Badge>
 *     Use for: tab counters next to a tab label.
 *     Shape: 11px / 700, padding 1px 7px, fully rounded.
 *
 * Tone palettes are exported below — pick the one that matches the
 * semantic, do NOT hand-code new bg/fg/border tuples in page files:
 *
 *   maintenanceStatusTone(status) → tone for "New" / "In Progress" / "Complete"
 *   priorityTone(priority)        → tone for "High" / "Medium" / "Low"
 *   reservationStatusTone(status) → tone for "Pending" / "Approved" / "Declined"
 *
 * If you need a new semantic, add a new tone helper here rather than
 * inlining `background: "rgba(...)"` in a page. Same goes for fonts and
 * sizes — match the 11px / 700 footprint so chips look identical across
 * /maintenance, /reservations, etc.
 *
 * Layout rules:
 *   • Tile/KPI cards (big number + small label) belong in their own
 *     component, not as a pill. Don't conflate the two.
 *   • Pills never carry the number on its own — they always wrap a
 *     short text label.
 */

import type React from "react";

export type PillTone = { bg: string; fg: string; border: string };

/**
 * Canonical KPI / stat tile. Matches the `.pill` styling in
 * app/globals.css — big number (28px / 900) on top, small muted label
 * (11px / 600) below, optional sub line. Use this for ALL "label + big
 * number" cards on admin pages (rent roll summary, maintenance KPI
 * tiles, "Open by Priority" breakdowns, etc.). Optional `accent`
 * colors the number (red for High priority, etc.); leave it off for
 * neutral stats.
 */
export function StatPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="pill">
      <b style={accent ? { color: accent } : undefined}>{value}</b>
      <span className="small muted">{label}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

export function Pill({ children, tone }: { children: React.ReactNode; tone: PillTone }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: tone.bg,
      color: tone.fg,
      border: `1px solid ${tone.border}`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{
      marginLeft: 6,
      padding: "1px 7px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: muted ? "rgba(15,23,42,0.06)" : "rgba(11,74,125,0.10)",
      color: muted ? "var(--muted)" : "#0b4a7d",
    }}>
      {children}
    </span>
  );
}

export const TONE_NEUTRAL: PillTone   = { bg: "rgba(15,23,42,0.06)",  fg: "#475569", border: "rgba(15,23,42,0.15)" };
export const TONE_BLUE: PillTone      = { bg: "rgba(11,74,125,0.10)", fg: "#0b4a7d", border: "rgba(11,74,125,0.30)" };
export const TONE_AMBER: PillTone     = { bg: "rgba(217,119,6,0.10)", fg: "#b45309", border: "rgba(217,119,6,0.30)" };
export const TONE_GREEN: PillTone     = { bg: "rgba(22,163,74,0.10)", fg: "#15803d", border: "rgba(22,163,74,0.30)" };
export const TONE_RED: PillTone       = { bg: "rgba(220,38,38,0.10)", fg: "#b91c1c", border: "rgba(220,38,38,0.30)" };
export const TONE_TEAL: PillTone      = { bg: "rgba(13,148,136,0.10)", fg: "#0d9488", border: "rgba(13,148,136,0.35)" };
export const TONE_PURPLE: PillTone    = { bg: "rgba(124,58,237,0.10)", fg: "#6d28d9", border: "rgba(124,58,237,0.30)" };
export const TONE_PINK: PillTone      = { bg: "rgba(219,39,119,0.10)", fg: "#be185d", border: "rgba(219,39,119,0.30)" };

/**
 * Stable color palette for multi-select chips (Suite Information flooring
 * / lighting, etc.). Use `paletteTone(index)` to color the Nth option so
 * the same choice always reads the same color.
 */
export const MULTISELECT_PALETTE: PillTone[] = [
  TONE_BLUE, TONE_TEAL, TONE_AMBER, TONE_PURPLE, TONE_GREEN, TONE_PINK, TONE_RED, TONE_NEUTRAL,
];

export function paletteTone(index: number): PillTone {
  const n = MULTISELECT_PALETTE.length;
  return MULTISELECT_PALETTE[((index % n) + n) % n];
}

export function maintenanceStatusTone(status: string): PillTone {
  switch (status) {
    case "New":         return TONE_BLUE;
    case "In Progress": return TONE_AMBER;
    case "Complete":    return TONE_GREEN;
    default:            return TONE_NEUTRAL;
  }
}

export function priorityTone(priority: string): PillTone {
  switch (priority) {
    case "High":   return TONE_RED;
    case "Medium": return TONE_AMBER;
    case "Low":    return TONE_NEUTRAL;
    default:       return TONE_NEUTRAL;
  }
}

export function reservationStatusTone(status: string): PillTone {
  switch (status) {
    case "Pending":  return TONE_AMBER;
    case "Approved": return TONE_GREEN;
    case "Declined": return TONE_RED;
    default:         return TONE_NEUTRAL;
  }
}

export function debtStatusTone(status: string): PillTone {
  switch (status) {
    case "Interest-Only":   return TONE_AMBER;
    case "Amortizing":      return TONE_GREEN;
    case "Maturity Passed": return TONE_RED;
    default:                return TONE_NEUTRAL;
  }
}
