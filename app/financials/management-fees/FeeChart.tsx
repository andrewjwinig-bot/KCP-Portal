"use client";

// The Management Fees "Actual vs Budget — by month" chart, shared by the
// Management Fees report and Alison's dashboard so the two cannot drift.

import { useState } from "react";
import { ChartTooltip, HoverBands, type TipRow } from "@/app/components/ChartTooltip";
import type { MgmtFeeData } from "@/lib/financials/management-fees/compute";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

// ─── Multi-series inline-SVG line chart (matches the rent-roll trends idiom) ───
export type Series = { label: string; color: string; values: (number | null)[]; dashed?: boolean; role?: "actual" | "budget" };
// A rounded axis range [min,max] with an even tick step covering [lo,hi], so
// labels land on clean numbers (…40k, 50k, 60k…) rather than raw data values.
function niceScale(lo: number, hi: number, ticks = 4): { min: number; max: number; step: number } {
  if (!(hi > lo)) hi = lo + 1;
  const rawStep = (hi - lo) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

export function LineChart({ series, fmt }: { series: Series[]; fmt: (v: number) => string }) {
  const W = 760, H = 280;
  const padL = 62, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = 12;
  const allVals = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  // Dynamic Y — tighten to the data (not anchored at $0) so the lines fill the
  // plot, with a rounded floor/ceiling and even tick steps.
  const rawLo = allVals.length ? Math.min(...allVals) : 0;
  const rawHi = allVals.length ? Math.max(...allVals) : 1;
  const pad = (rawHi - rawLo) * 0.12 || Math.abs(rawHi) * 0.05 || 1;
  const { min: yMin, max: yMax, step: yStep } = niceScale(rawLo - pad, rawHi + pad);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + yStep * 1e-6; v += yStep) yTicks.push(v);
  // Dynamic X — span only the months that actually carry data.
  const withData = series.flatMap((s) => s.values.map((v, i) => (v != null ? i : -1))).filter((i) => i >= 0);
  const firstI = withData.length ? Math.min(...withData) : 0;
  const lastI = withData.length ? Math.max(...withData) : n - 1;
  const xSpan = Math.max(1, lastI - firstI);
  const xs = (i: number) => padL + ((i - firstI) / xSpan) * innerW;
  const ys = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const [hover, setHover] = useState<number | null>(null);

  // Tooltip content for the hovered month.
  const tipRows: TipRow[] = hover == null ? [] : series
    .filter((s) => s.values[hover] != null)
    .map((s) => ({ label: s.label, color: s.color, value: money(s.values[hover]!) }));
  const va = hover != null ? series.find((s) => s.role === "actual")?.values[hover] ?? null : null;
  const bu = hover != null ? series.find((s) => s.role === "budget")?.values[hover] ?? null : null;
  const variance = va != null && bu != null ? va - bu : null;
  const variancePctVal = variance != null && bu ? (variance / bu) * 100 : null;
  const footer: TipRow | undefined = variance == null ? undefined : {
    label: "Variance",
    value: `${variance >= 0 ? "+" : ""}${money(variance)}${variancePctVal != null ? ` (${variance >= 0 ? "+" : ""}${variancePctVal.toFixed(1)}%)` : ""}`,
    color: variance >= 0 ? "#15803d" : "#b45309",
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }} onMouseLeave={() => setHover(null)}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke="rgba(15,23,42,0.08)" />
          <text x={padL - 8} y={ys(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end">{fmt(v)}</text>
        </g>
      ))}
      {MONTHS.map((mo, i) => (i < firstI || i > lastI ? null : (
        <text key={mo} x={xs(i)} y={H - padB + 17} fontSize={10} fontWeight={hover === i ? 800 : 400} fill={hover === i ? "var(--text)" : "var(--muted)"} textAnchor="middle">{mo}</text>
      )))}

      {/* Series lines + points (non-interactive; the hit band below drives hover) */}
      <g pointerEvents="none">
        {series.map((s) => {
          const pts = s.values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
          if (!pts.length) return null;
          const path = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${xs(p.i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => {
                const on = hover === p.i;
                return <circle key={p.i} cx={xs(p.i)} cy={ys(p.v)} r={on ? 6 : 3.5} fill={s.color} stroke="#fff" strokeWidth={on ? 2.5 : 1.5} />;
              })}
            </g>
          );
        })}
      </g>

      <HoverBands n={n} xAt={xs} x0={padL} x1={padL + innerW} top={padT} height={innerH} active={hover} onHover={setHover} />
      {hover != null && tipRows.length > 0 && (
        <ChartTooltip x={xs(hover)} y={padT + 2} chartW={W} title={MONTHS_LONG[hover]} rows={tipRows} footer={footer} />
      )}
    </svg>
  );
}

export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
      {series.map((s) => (
        <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
          <span style={{ width: 14, height: 0, borderTop: `2.5px ${s.dashed ? "dashed" : "solid"} ${s.color}` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// Actual (posted months) against the LIK 2010 fee plan — the budget staff
// reference — falling back to the bottom-up building budgets when the 2010
// budget isn't loaded.
export function feeChartSeries(data: MgmtFeeData | null): Series[] {
  if (!data) return [];
  const { portfolio, completeThrough } = data;
  const usingLik = !!portfolio.likPlanMonthly;
  const budgetMonthly = portfolio.likPlanMonthly ?? portfolio.budgetBottomUpMonthly;
  return [
    { label: "Actual", role: "actual", color: "#0b4a7d", values: portfolio.actualMonthly.map((v, i) => (i < completeThrough ? v : null)) },
    { label: usingLik ? "LIK Fee Plan" : "Budget (bottom-up)", role: "budget", color: "#16a34a", values: budgetMonthly.map((v) => v), dashed: true },
  ];
}

export const kFmt = (v: number) => "$" + Math.round(v / 1000) + "k";
