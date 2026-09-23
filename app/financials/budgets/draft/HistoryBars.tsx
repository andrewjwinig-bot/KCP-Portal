"use client";

// A line's history as a bar chart — one bar per year, actuals, with the
// current year taken to a FULL YEAR from its reprojection (actual to date +
// budget for the rest) so it stands beside the complete years instead of
// reading as a collapse. That bar is drawn lighter with a dashed edge: it is a
// projection, not a fact. Each year's budget is a short tick across its bar,
// and a dashed line marks the average of the bars shown. Hover a year for its
// actual, budget and variance.

import { useState } from "react";
import { ChartTooltip, HoverBands } from "@/app/components/ChartTooltip";
import { tightScale } from "@/lib/charts/tightScale";
import type { LineYear } from "@/lib/financials/budgets/lineHistory";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const short = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M` : a >= 1000 ? `${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}k` : `${Math.round(a)}`;
  return `${n < 0 ? "-" : ""}$${s}`;
};

const W = 820, H = 240;
const PAD = { l: 58, r: 16, t: 16, b: 34 };

type Bar = { year: number; value: number | null; budget: number | null; projected: boolean; monthsCovered: number };

export function HistoryBars({ years, forecast }: {
  years: LineYear[];
  /** The latest year's full-year reprojection, when that year is partial. */
  forecast?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const last = years[years.length - 1];
  const bars: Bar[] = years.map((y) => {
    const partial = y.actual != null && y.monthsCovered < 12;
    const useForecast = y === last && partial && forecast != null;
    return {
      year: y.year,
      value: useForecast ? forecast! : y.actual,
      budget: y.budget,
      projected: useForecast,
      monthsCovered: y.monthsCovered,
    };
  });
  const vals = bars.flatMap((b) => [b.value, b.budget]).filter((v): v is number => v != null);
  if (!vals.length) return null;
  // The average of the bars shown: complete years, plus the current year only
  // once it is a full-year projection (a part year would drag it down).
  const inAvg = bars.filter((b) => b.value != null && (b.projected || b.monthsCovered >= 12));
  const avg = inAvg.length ? inAvg.reduce((a, b) => a + (b.value as number), 0) / inAvg.length : null;

  const sc = tightScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + ((sc.max - v) / (sc.max - sc.min || 1)) * plotH;
  const slot = plotW / bars.length;
  const cx = (i: number) => PAD.l + slot * i + slot / 2;
  const bw = Math.min(64, slot * 0.5);
  const ticks: number[] = [];
  for (let v = sc.min; v <= sc.max + 1e-6; v += sc.step) ticks.push(v);

  const hb = hover != null ? bars[hover] : null;
  const variance = hb && hb.value != null && hb.budget != null ? hb.value - hb.budget : null;

  return (
    <div style={{ marginTop: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1.25 : 1} />
            <text x={PAD.l - 8} y={y(v) + 4} fontSize={11} textAnchor="end" fill="var(--muted)">{short(v)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          if (b.value == null) {
            return <text key={b.year} x={cx(i)} y={y(0) - 6} fontSize={11} textAnchor="middle" fill="var(--muted)">no GL</text>;
          }
          const top = y(Math.max(0, b.value)), bot = y(Math.min(0, b.value));
          const on = hover === i;
          return (
            <g key={b.year}>
              <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} rx={3}
                fill="var(--series-1)" fillOpacity={b.projected ? 0.35 : on ? 1 : 0.85}
                stroke={b.projected ? "var(--series-1)" : "none"} strokeDasharray={b.projected ? "4 3" : undefined} strokeWidth={1.5} />
              <text x={cx(i)} y={top - 6} fontSize={11.5} fontWeight={700} textAnchor="middle" fill="var(--text)">{short(b.value)}</text>
            </g>
          );
        })}
        {/* Each year's budget: a tick across the bar. */}
        {bars.map((b, i) => b.budget == null ? null : (
          <line key={`b${b.year}`} x1={cx(i) - bw / 2 - 6} x2={cx(i) + bw / 2 + 6} y1={y(b.budget)} y2={y(b.budget)}
            stroke="var(--muted)" strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {avg != null && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(avg)} y2={y(avg)} stroke="var(--series-2)" strokeWidth={1.75} strokeDasharray="6 4" />
            <text x={W - PAD.r} y={y(avg) - 5} fontSize={11} fontWeight={700} textAnchor="end" fill="var(--series-2)">avg {short(avg)}</text>
          </g>
        )}
        {bars.map((b, i) => (
          <text key={`x${b.year}`} x={cx(i)} y={H - PAD.b + 18} fontSize={12} fontWeight={700} textAnchor="middle" fill="var(--text)">
            {b.year}{b.projected ? " (proj.)" : b.value != null && b.monthsCovered < 12 ? ` · ${b.monthsCovered} mo` : ""}
          </text>
        ))}
        <HoverBands n={bars.length} xAt={cx} x0={cx(0)} x1={cx(bars.length - 1)} top={PAD.t} height={plotH} active={hover} onHover={setHover} />
        {hb && (
          <ChartTooltip x={cx(hover!)} y={PAD.t + 10} chartW={W}
            title={hb.projected ? `${hb.year} (reprojected)` : String(hb.year)} width={210}
            rows={[
              { label: hb.projected ? "Reprojected" : "Actual", value: hb.value == null ? "—" : money0(hb.value), color: "var(--series-1)" },
              { label: "Budget", value: hb.budget == null ? "—" : money0(hb.budget), color: "var(--muted)" },
              ...(avg != null ? [{ label: "Average", value: money0(avg), color: "var(--series-2)" }] : []),
            ]}
            footer={variance == null ? undefined : { label: "vs budget", value: `${variance > 0 ? "+" : ""}${money0(variance)}`, color: variance > 0 ? "#b91c1c" : "#15803d" }} />
        )}
      </svg>
      <div className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, marginTop: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--series-1)" }} /> Actual</span>
        {bars.some((b) => b.projected) && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--series-1)", opacity: 0.35, outline: "1.5px dashed var(--series-1)" }} /> Reprojected (actual to date + budget for the rest)</span>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--muted)" }} /> Budget</span>
        {avg != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, borderTop: "2px dashed var(--series-2)" }} /> Average</span>}
      </div>
    </div>
  );
}
