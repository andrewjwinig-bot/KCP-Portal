"use client";

// A balance over time — one line, its area tinted, a hover card per date with
// the change from the date before. Shared by the property page's Bank Balance
// chart and the Bank Balances header tiles (owner: "click the header KPI pills
// … to see line charts over time"), so the two read the same. An optional
// reference line (e.g. today's reserves) is drawn dashed across the plot.

import React, { useState } from "react";
import { ChartTooltip, HoverBands } from "./ChartTooltip";
import { tightScale } from "../../lib/charts/tightScale";

export type TrendPoint = { date: string; value: number };

const GOOD = "var(--c-15803d)", BAD = "var(--c-b91c1c)";
const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const compact = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${s}$${Math.round(a / 1e3)}K` : `${s}$${Math.round(a).toLocaleString("en-US")}`;
};
export const shortDate = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function BalanceTrendChart({ points, label = "Balance", color = "var(--series-1)", refLine }: {
  points: TrendPoint[];
  label?: string;
  color?: string;
  refLine?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 280, padL = 62, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = points.length;
  const vals = points.map((p) => p.value).concat(refLine ? [refLine.value] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const sc = tightScale(Math.min(0, lo), Math.max(0, hi));
  const y = (v: number) => padT + innerH - ((v - sc.min) / (sc.max - sc.min || 1)) * innerH;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const ticks: number[] = [];
  for (let v = Math.ceil(sc.min / sc.step) * sc.step; v <= sc.max + 1e-6; v += sc.step) ticks.push(v);
  const path = points.map((p, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const base = y(Math.max(0, sc.min));
  const area = n > 1 ? `${path} L ${x(n - 1).toFixed(1)} ${base.toFixed(1)} L ${x(0).toFixed(1)} ${base.toFixed(1)} Z` : "";
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const prev = hover != null && hover > 0 ? points[hover - 1].value : null;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }} onMouseLeave={() => setHover(null)}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(15,23,42,0.25)" : "rgba(15,23,42,0.08)"} />
          <text x={padL - 8} y={y(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end">{compact(v)}</text>
        </g>
      ))}
      {area && <path d={area} fill={color} opacity={0.12} pointerEvents="none" />}
      {refLine && (
        <g pointerEvents="none">
          <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--series-3)" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W - padR} y={y(refLine.value) - 5} fontSize={10} fontWeight={700} fill="var(--series-3)" textAnchor="end">{refLine.label} · {compact(refLine.value)}</text>
        </g>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" pointerEvents="none" />
      {points.map((p, i) => (
        <g key={p.date} pointerEvents="none">
          <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 3} fill={color} stroke="#fff" strokeWidth={1.5} />
          {(i % labelEvery === 0 || i === n - 1) && (
            <text x={x(i)} y={H - padB + 17} fontSize={10} fill={hover === i ? "var(--text)" : "var(--muted)"} fontWeight={hover === i ? 800 : 400} textAnchor="middle">{shortDate(p.date)}</text>
          )}
        </g>
      ))}
      <HoverBands n={n} xAt={x} x0={padL} x1={padL + innerW} top={padT} height={innerH} active={hover} onHover={setHover} />
      {hover != null && (
        <ChartTooltip x={x(hover)} y={padT + 2} chartW={W} title={longDate(points[hover].date)}
          rows={[
            { label, value: money(points[hover].value), color },
            ...(refLine ? [{ label: refLine.label, value: money(refLine.value), color: "var(--series-3)" }] : []),
          ]}
          footer={prev != null ? { label: "Change", value: `${points[hover].value - prev >= 0 ? "+" : "−"}${money(Math.abs(points[hover].value - prev))}`, color: points[hover].value - prev >= 0 ? GOOD : BAD } : undefined} />
      )}
    </svg>
  );
}
