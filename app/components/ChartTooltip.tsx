// Shared chart hover primitives — one considered, styled tooltip used across
// every inline-SVG chart in the app (management fees, rent-roll trends, expense
// trends, CAM recovery), so hovers look and feel the same everywhere.
//
// Two pieces:
//   • ChartTooltip — an in-SVG <g> card (title + colored value rows + an optional
//     footer/delta line), with automatic left/right edge-flipping. Callers pass
//     pre-formatted string values and position it at the hovered x/y.
//   • useHoverIndex + HoverBands — the "which month/point am I on" helper: full-
//     height transparent hit bands that set the active index, plus a dashed
//     guide line. Points enlarge on the active index in each chart.

import React from "react";

export type TipRow = { label: string; value: string; color?: string };

export function ChartTooltip({
  x, y, chartW, title, rows, footer, width = 188,
}: {
  /** x of the hovered point (SVG units). */
  x: number;
  /** Top y for the card (SVG units). */
  y: number;
  /** Chart width (SVG units) — used to flip the card left near the right edge. */
  chartW: number;
  title: string;
  rows: TipRow[];
  footer?: TipRow;
  width?: number;
}) {
  const rowH = 19;
  const boxH = 30 + rows.length * rowH + (footer ? rowH + 6 : 0);
  const boxX = x + 16 + width > chartW - 6 ? x - 16 - width : x + 16;
  const boxY = Math.max(4, y);
  const rowBase = boxY + 30;

  return (
    <g pointerEvents="none" style={{ filter: "drop-shadow(0 4px 14px rgba(15,23,42,0.20))" }}>
      <rect x={boxX} y={boxY} width={width} height={boxH} rx={9} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
      <text x={boxX + 13} y={boxY + 20} fontSize={12.5} fontWeight={800} fill="var(--text)">{title}</text>
      {rows.map((r, k) => {
        const cy = rowBase + k * rowH + rowH / 2;
        return (
          <g key={k}>
            {r.color && <circle cx={boxX + 17} cy={cy} r={4.5} fill={r.color} />}
            <text x={boxX + (r.color ? 28 : 13)} y={cy + 4} fontSize={12} fill="var(--muted)">{r.label}</text>
            <text x={boxX + width - 13} y={cy + 4} fontSize={12.5} fontWeight={700} fill="var(--text)" textAnchor="end">{r.value}</text>
          </g>
        );
      })}
      {footer && (
        <g>
          <line x1={boxX + 13} x2={boxX + width - 13} y1={rowBase + rows.length * rowH + 2} y2={rowBase + rows.length * rowH + 2} stroke="var(--border)" />
          <text x={boxX + 13} y={rowBase + rows.length * rowH + rowH} fontSize={12} fill="var(--muted)">{footer.label}</text>
          <text x={boxX + width - 13} y={rowBase + rows.length * rowH + rowH} fontSize={12.5} fontWeight={800} textAnchor="end" fill={footer.color ?? "var(--text)"}>{footer.value}</text>
        </g>
      )}
    </g>
  );
}

/** Transparent full-height hit bands (one per x index) that report the hovered
 *  index, plus a dashed vertical guide line at that index. Render this LAST in
 *  the SVG so it sits above the series (the guide line is non-interactive). */
export function HoverBands({
  n, xAt, x0, x1, top, height, active, onHover,
}: {
  n: number;
  /** center x for index i. */
  xAt: (i: number) => number;
  /** plot left / right bounds (for clamping the band width). */
  x0: number;
  x1: number;
  top: number;
  height: number;
  active: number | null;
  onHover: (i: number | null) => void;
}) {
  const step = n > 1 ? (x1 - x0) / (n - 1) : x1 - x0;
  return (
    <g>
      {active != null && (
        <line x1={xAt(active)} x2={xAt(active)} y1={top} y2={top + height} stroke="rgba(11,74,125,0.30)" strokeWidth={1.25} strokeDasharray="3 3" pointerEvents="none" />
      )}
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={Math.max(x0 - step / 2, xAt(i) - step / 2)} y={top} width={step} height={height} fill="transparent" style={{ cursor: "crosshair" }} onMouseEnter={() => onHover(i)} />
      ))}
    </g>
  );
}
