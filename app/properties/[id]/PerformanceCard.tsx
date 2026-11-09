"use client";

// THE PROPERTY'S COMMAND CENTER, financial half (owner: "each property page
// should be a dashboard … a graph of how were doing this year vs budget";
// "i like visuals and graphical displays of data"). This year against budget
// off the property's reprojection: four tiles, cumulative NOI against the
// budget's path, NOI month by month, and the lines driving the variance.
// Hidden for anyone who cannot open the operating statements (the API says 403).

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatPill } from "../../components/Pill";
import { HoverCard } from "../../components/HoverCard";
import { TabButton } from "../../components/TabButton";
import { ChartTooltip, HoverBands, type TipRow } from "../../components/ChartTooltip";
import { ChartLegend, LineChart, type Series } from "../../financials/management-fees/FeeChart";
import { tightScale } from "../../../lib/charts/tightScale";
import { BalanceTrendChart } from "../../components/BalanceTrendChart";
import type { BalanceTrend } from "../../../lib/financials/bank-balances/trend";
import { cumulative, type PerfLine, type PerfTotals, type PropertyPerformance } from "../../../lib/properties/performance";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ACTUAL = "var(--series-1)";
const BUDGET = "var(--series-3)";
const GOOD = "#15803d", BAD = "#b91c1c", WARN = "#b45309";

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const compact = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${s}$${Math.round(a / 1e3)}K` : `${s}$${Math.round(a).toLocaleString("en-US")}`;
};
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${compact(Math.abs(n))}`;
const pctOf = (v: number, base: number) => (Math.abs(base) >= 1 ? `${v >= 0 ? "+" : "−"}${Math.abs((v / Math.abs(base)) * 100).toFixed(1)}%` : "");

export default function PerformanceCard({ code, style }: { code: string; style?: React.CSSProperties }) {
  const [perf, setPerf] = useState<PropertyPerformance | null>(null);
  const [bank, setBank] = useState<BalanceTrend | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/properties/${encodeURIComponent(code)}/performance`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setPerf(j?.performance ?? null); setBank(j?.bank?.points?.length ? j.bank : null); } })
      .catch(() => { if (alive) setPerf(null); });
    return () => { alive = false; };
  }, [code]);

  const perfShown = !!perf && (perf.through > 0 || perf.hasBudget);
  if (!perfShown) return bank ? (
    <div className="card" style={{ ...style }}>
      <ChartPanel title="Bank Balance" sub={bankSub(bank)}><BankTrend t={bank} /></ChartPanel>
    </div>
  ) : null;
  if (!perf) return null;
  const n = perf.through;
  const through = n ? MONTHS[n - 1] : null;

  // A tile: the YTD figure, against budget, favorable-signed.
  const tile = (label: string, t: PerfTotals, expense = false, fullYear = false) => {
    const a = fullYear ? t.fullYearReproj : t.ytdActual, b = fullYear ? t.fullYearBudget : t.ytdBudget;
    const v = expense ? b - a : a - b;
    const has = perf.hasBudget && Math.abs(b) >= 1;
    return (
      <StatPill key={label} label={label} value={compact(a)}
        // A miss within 2% is amber, not alarm-red.
        accent={has ? (v >= 0 ? GOOD : Math.abs(v) <= Math.abs(b) * 0.02 ? WARN : BAD) : undefined}
        sub={has ? `${signed(v)} (${pctOf(v, b)}) vs ${compact(b)} budget` : "No budget on file"} />
    );
  };

  return (
    <div className="card" style={{ ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>{perf.year} Performance</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {through ? `Actual through ${MONTHS_LONG[n - 1]} · against budget` : "No actuals posted yet this year"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/financials/operating-statements?key=${encodeURIComponent(perf.key)}`} className="btn sm" style={{ textDecoration: "none" }}>Operating statement →</Link>
          <Link href={`/financials/reprojections?key=${encodeURIComponent(perf.key)}`} className="btn sm" style={{ textDecoration: "none" }}>Reprojection →</Link>
        </div>
      </div>

      <div className="pills" style={{ marginTop: 14 }}>
        {tile(`NOI · YTD${through ? ` ${through}` : ""}`, perf.noi)}
        {tile("Revenue · YTD", perf.revenue)}
        {tile("Operating Expenses · YTD", perf.opex, true)}
        {tile("NOI · Full-Year Reprojection", perf.noi, false, true)}
        {perf.cashFlow && tile("Cash Flow After Debt · YTD", perf.cashFlow)}
      </div>

      {/* ONE chart at full width, picked by tab — three side by side were too small to read (owner). */}
      <PerfCharts perf={perf} bank={bank} through={n} />

      {perf.hasBudget && n > 0 && <VarianceDrivers lines={perf.lines} through={MONTHS[n - 1]} />}
    </div>
  );
}

type ChartKey = "month" | "cum" | "bank";
function PerfCharts({ perf, bank, through }: { perf: PropertyPerformance; bank: BalanceTrend | null; through: number }) {
  const [tab, setTab] = useState<ChartKey>("month");
  const tabs: { key: ChartKey; label: string; sub: string }[] = [
    { key: "month", label: "NOI by Month", sub: "Bars are actual; the dashed outline is budget" },
    { key: "cum", label: "Cumulative NOI", sub: "Where the year is heading against the budget's path" },
    ...(bank ? [{ key: "bank" as ChartKey, label: "Bank Balance", sub: bankSub(bank) }] : []),
  ];
  const cur = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px 14px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="muted" style={{ fontSize: 13 }}>{cur.sub}</div>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => <TabButton key={t.key} active={cur.key === t.key} onClick={() => setTab(t.key)}>{t.label}</TabButton>)}
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "10px auto 0" }}>
        {cur.key === "month" && <MonthBars t={perf.noi} through={through} />}
        {cur.key === "cum" && <CumulativeNoi noi={perf.noi} through={through} />}
        {cur.key === "bank" && bank && <BankTrend t={bank} />}
      </div>
    </div>
  );
}

function ChartPanel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{sub}</div>
      {children}
    </div>
  );
}

function CumulativeNoi({ noi, through }: { noi: PerfTotals; through: number }) {
  const series = useMemo<Series[]>(() => {
    const act = cumulative(noi.actual), bud = cumulative(noi.budget), rep = cumulative(noi.blended);
    const s: Series[] = [
      { label: "Actual", role: "actual", color: ACTUAL, values: act.map((v, i) => (i < through ? v : null)) },
      { label: "Budget", role: "budget", color: BUDGET, values: bud, dashed: true },
    ];
    if (through > 0 && through < 12) s.push({ label: "Reprojection", color: ACTUAL, dashed: true, values: rep.map((v, i) => (i >= through - 1 ? v : null)) });
    return s;
  }, [noi, through]);
  return (<><LineChart series={series} fmt={compact} /><ChartLegend series={series} /></>);
}

/** NOI month by month: the actual as a solid bar, the budget as an outline behind it. */
function MonthBars({ t, through }: { t: PerfTotals; through: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 280, padL = 62, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = [...t.budget, ...t.actual.slice(0, through)];
  const sc = tightScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v: number) => padT + innerH - ((v - sc.min) / (sc.max - sc.min || 1)) * innerH;
  const slot = innerW / 12, bw = slot * 0.56;
  const xc = (i: number) => padL + slot * i + slot / 2;
  const ticks: number[] = [];
  for (let v = Math.ceil(sc.min / sc.step) * sc.step; v <= sc.max + 1e-6; v += sc.step) ticks.push(v);
  const rows: TipRow[] = hover == null ? [] : [
    ...(hover < through ? [{ label: "Actual", value: money(t.actual[hover]), color: ACTUAL }] : []),
    { label: "Budget", value: money(t.budget[hover]), color: BUDGET },
  ];
  const v = hover != null && hover < through ? t.actual[hover] - t.budget[hover] : null;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }} onMouseLeave={() => setHover(null)}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(15,23,42,0.25)" : "rgba(15,23,42,0.08)"} />
          <text x={padL - 8} y={y(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end">{compact(v)}</text>
        </g>
      ))}
      {MONTHS.map((m, i) => {
        const b = t.budget[i], a = t.actual[i], posted = i < through;
        const top = (val: number) => Math.min(y(val), y(0)), h = (val: number) => Math.abs(y(val) - y(0));
        return (
          <g key={m} pointerEvents="none">
            <rect x={xc(i) - bw / 2 - 3} y={top(b)} width={bw + 6} height={Math.max(1, h(b))} rx={3}
              fill="none" stroke={BUDGET} strokeWidth={2} strokeDasharray="5 3" opacity={hover == null || hover === i ? 1 : 0.5} />
            {posted && (
              <rect x={xc(i) - bw / 2} y={top(a)} width={bw} height={Math.max(1, h(a))} rx={3}
                fill={a >= b ? ACTUAL : "var(--series-2)"} opacity={hover == null || hover === i ? 0.95 : 0.45} />
            )}
            <text x={xc(i)} y={H - padB + 17} fontSize={10} fontWeight={hover === i ? 800 : 400} fill={hover === i ? "var(--text)" : "var(--muted)"} textAnchor="middle">{m}</text>
          </g>
        );
      })}
      <HoverBands n={12} xAt={xc} x0={padL + slot / 2} x1={padL + innerW - slot / 2} top={padT} height={innerH} active={hover} onHover={setHover} />
      {hover != null && (
        <ChartTooltip x={xc(hover)} y={padT + 2} chartW={W} title={MONTHS_LONG[hover]} rows={rows}
          footer={v != null ? { label: "Variance", value: `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`, color: v >= 0 ? GOOD : BAD } : undefined} />
      )}
    </svg>
  );
}

/** The lines driving the year's variance, as a diverging bar list: favorable
 *  to the right in green, unfavorable to the left in red. */
function VarianceDrivers({ lines, through }: { lines: PerfLine[]; through: string }) {
  const top = lines.filter((l) => Math.abs(l.variance) >= 500).slice(0, 8);
  if (!top.length) return null;
  const max = Math.max(...top.map((l) => Math.abs(l.variance)));
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginTop: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>What&apos;s Driving the Variance</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Year to date through {through} · largest first · green is favorable</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", rowGap: 8, columnGap: 14, alignItems: "center" }}>
        {top.map((l) => {
          const w = (Math.abs(l.variance) / max) * 40; // leaves room for the figure
          const good = l.variance >= 0;
          return (
            <React.Fragment key={`${l.section}::${l.label}`}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.label}<span className="muted" style={{ fontWeight: 500, fontSize: 11, marginLeft: 6 }}>{l.kind === "revenue" ? "revenue" : "expense"}</span>
              </div>
              <HoverCard title={`${l.label} · YTD`} help={false} rows={[
                { label: "Actual", value: money(l.ytdActual) },
                { label: "Budget", value: money(l.ytdBudget) },
              ]} footer={{ label: good ? "Favorable" : "Unfavorable", value: `${good ? "+" : "−"}${money(Math.abs(l.variance))}`, color: good ? GOOD : BAD }}
                style={{ display: "block" }}>
                <div style={{ position: "relative", height: 22 }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border)" }} />
                  <div style={{
                    position: "absolute", top: 3, height: 16, borderRadius: 4, width: `${w}%`,
                    left: good ? "50%" : `${50 - w}%`, background: good ? GOOD : BAD, opacity: 0.85,
                  }} />
                  <span style={{
                    position: "absolute", top: 2, fontSize: 12, fontWeight: 700, color: good ? GOOD : BAD, whiteSpace: "nowrap",
                    ...(good ? { left: `calc(${50 + w}% + 6px)` } : { right: `calc(${50 + w}% + 6px)` }),
                  }}>{good ? "+" : "−"}{compact(Math.abs(l.variance))}</span>
                </div>
              </HoverCard>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const shortDate = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };
function bankSub(t: BalanceTrend): string {
  const last = t.points[t.points.length - 1], first = t.points[0];
  const ch = last.balance - first.balance;
  return `${t.name}${t.accounts > 1 ? ` · ${t.accounts} accounts` : ""} · ${money(last.balance)} on ${shortDate(last.date)}`
    + (t.points.length > 1 ? ` · ${ch >= 0 ? "up" : "down"} ${compact(Math.abs(ch))} since ${shortDate(first.date)}` : "");
}

/** The line's balance at each weekly import — an area under a line. */
function BankTrend({ t }: { t: BalanceTrend }) {
  return <BalanceTrendChart points={t.points.map((p) => ({ date: p.date, value: p.balance }))} color={ACTUAL} />;
}
