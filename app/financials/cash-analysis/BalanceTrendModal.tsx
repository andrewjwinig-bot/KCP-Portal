"use client";

// The Bank Balances header tiles, over time (owner: "click the header KPI
// pills at the top to see line charts over time"). One modal, a tab per
// metric, off the weekly import snapshots (`portfolioTrend`). Reserves have no
// history — they are the budget's Big Projects for the next three months — so
// Net Available is drawn as OPERATING CASH over time against TODAY'S reserves
// (dashed): the gap at the right edge is today's net available, and the line
// shows how far the cash has moved toward or away from it.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { StatPill } from "@/app/components/Pill";
import { TabButton } from "@/app/components/TabButton";
import { BalanceTrendChart } from "@/app/components/BalanceTrendChart";

export type PortfolioPoint = { date: string; cash: number; deposits: number; handsOff: number; operating: number };
export type TrendMetric = "cash" | "deposits" | "net";

const METRICS: { key: TrendMetric; label: string; color: string }[] = [
  { key: "cash", label: "Cash in Bank", color: "var(--series-1)" },
  { key: "net", label: "Net Available", color: "var(--series-2)" },
  { key: "deposits", label: "Security Deposits", color: "var(--series-4)" },
];

const money0 = (n: number) => { const v = Math.round(n); const s = Math.abs(v).toLocaleString("en-US"); return v < 0 ? `($${s})` : `$${s}`; };
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const secLabel: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" };

export function BalanceTrendModal({ trend, metric, onMetric, operatingReserves, onClose }: {
  trend: PortfolioPoint[];
  metric: TrendMetric;
  onMetric: (m: TrendMetric) => void;
  /** Today's reserves on the operating lines, hands-off money excluded. */
  operatingReserves: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const m = METRICS.find((x) => x.key === metric)!;
  const value = (p: PortfolioPoint) => (metric === "cash" ? p.cash : metric === "deposits" ? p.deposits : p.operating);
  const points = trend.map((p) => ({ date: p.date, value: value(p) }));
  const vals = points.map((p) => p.value);
  const first = points[0], last = points[points.length - 1];
  const change = first && last ? last.value - first.value : 0;
  const hiI = vals.indexOf(Math.max(...vals)), loI = vals.indexOf(Math.min(...vals));

  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 900, width: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={secLabel}>Bank Balances · over time</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{m.label}</div>
          </div>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
          {METRICS.map((x) => <TabButton key={x.key} active={x.key === metric} onClick={() => onMetric(x.key)}>{x.label}</TabButton>)}
        </div>
        {points.length < 2 ? (
          <div className="muted small" style={{ padding: "18px 0" }}>
            Not enough history yet — each Monday's import adds a point{first ? ` (first on ${dateLabel(first.date)})` : ""}.
          </div>
        ) : (
          <>
            <div className="pills" style={{ marginTop: 0 }}>
              <StatPill label={`Now · ${dateLabel(last.date)}`} value={money0(metric === "net" ? last.value - operatingReserves : last.value)} total
                sub={metric === "net" ? `${money0(last.value)} operating − ${money0(operatingReserves)} reserves` : undefined} />
              <StatPill label={`Since ${dateLabel(first.date)}`} value={`${change >= 0 ? "+" : "−"}${money0(Math.abs(change))}`}
                accent={change >= 0 ? "#15803d" : "#b91c1c"} sub={metric === "net" ? "Operating cash" : undefined} />
              <StatPill label="High" value={money0(vals[hiI])} sub={dateLabel(points[hiI].date)} />
              <StatPill label="Low" value={money0(vals[loI])} sub={dateLabel(points[loI].date)} />
            </div>
            <BalanceTrendChart points={points} color={m.color}
              label={metric === "net" ? "Operating cash" : m.label}
              refLine={metric === "net" ? { value: operatingReserves, label: "Reserves today" } : undefined} />
            <div className="muted small">
              {metric === "net"
                ? "Operating cash — every account except security deposits and the hands-off trust — after each import. Reserves are the budget's Big Projects for the next three months and have no history, so the dashed line is today's figure: the gap at the right edge is today's net available."
                : metric === "deposits"
                  ? "Tenants' security deposit accounts after each import."
                  : "Every account after each import — the three banks together, each at its newest figure on that date."}
            </div>
          </>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
