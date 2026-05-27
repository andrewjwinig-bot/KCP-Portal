"use client";

import { useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import type { HistoricalOpExEntry } from "@/lib/financials/historical-opex/types";

function money(n: number): string {
  if (n === 0) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

type EntryStats = {
  years: number[];
  values: number[];          // matched to years
  nonZeroValues: number[];   // for averaging; excludes literal $0 (treated as missing)
  min: number;
  max: number;
  avg: number;               // long-run average over non-zero years
  recent3Avg: number | null; // average of last 3 non-zero years
  latest: { year: number; value: number } | null;
  earliest: { year: number; value: number } | null;
  recentTrend: "up" | "down" | "flat" | null;
};

function summarize(entry: HistoricalOpExEntry): EntryStats {
  const years = Object.keys(entry.yearly).map(Number).sort((a, b) => a - b);
  const values = years.map((y) => entry.yearly[String(y)] ?? 0);
  const nonZeroValues = values.filter((v) => v > 0);
  const min = nonZeroValues.length ? Math.min(...nonZeroValues) : 0;
  const max = nonZeroValues.length ? Math.max(...nonZeroValues) : 0;
  const avg = nonZeroValues.length ? nonZeroValues.reduce((s, v) => s + v, 0) / nonZeroValues.length : 0;
  const recentValues: number[] = [];
  for (let i = years.length - 1; i >= 0 && recentValues.length < 3; i--) {
    if (values[i] > 0) recentValues.push(values[i]);
  }
  const recent3Avg = recentValues.length ? recentValues.reduce((s, v) => s + v, 0) / recentValues.length : null;
  const latest = years.length ? { year: years[years.length - 1], value: values[years.length - 1] } : null;
  const earliest = years.length ? { year: years[0], value: values[0] } : null;
  let recentTrend: EntryStats["recentTrend"] = null;
  if (recentValues.length >= 2) {
    const newest = recentValues[0];
    const older = recentValues[recentValues.length - 1];
    if (newest > older * 1.03) recentTrend = "up";
    else if (newest < older * 0.97) recentTrend = "down";
    else recentTrend = "flat";
  }
  return { years, values, nonZeroValues, min, max, avg, recent3Avg, latest, earliest, recentTrend };
}

/** Tiny inline sparkline. Plots non-zero values; gaps (missing years
 *  and explicit zeros) leave a break in the line so they're visible. */
function Sparkline({ years, values, width = 320, height = 56 }: {
  years: number[];
  values: number[];
  width?: number;
  height?: number;
}) {
  if (years.length < 2) return null;
  const span = years[years.length - 1] - years[0];
  const nonZero = values.filter((v) => v > 0);
  const min = nonZero.length ? Math.min(...nonZero) : 0;
  const max = nonZero.length ? Math.max(...nonZero) : 1;
  const range = max - min || 1;
  const x = (y: number) => ((y - years[0]) / span) * (width - 6) + 3;
  const yPos = (v: number) => height - 6 - ((v - min) / range) * (height - 12);

  // Build path segments — break when a value is 0 (missing-data marker).
  const segments: string[] = [];
  let current = "";
  for (let i = 0; i < years.length; i++) {
    if (values[i] > 0) {
      const cmd = current ? "L" : "M";
      current += `${current ? " " : ""}${cmd}${x(years[i]).toFixed(1)},${yPos(values[i]).toFixed(1)}`;
    } else if (current) {
      segments.push(current);
      current = "";
    }
  }
  if (current) segments.push(current);

  return (
    <svg width={width} height={height} style={{ display: "block" }} aria-hidden>
      {/* Min/max grid lines */}
      <line x1={3} y1={yPos(min)} x2={width - 3} y2={yPos(min)} stroke="rgba(15,23,42,0.06)" strokeWidth={1} />
      <line x1={3} y1={yPos(max)} x2={width - 3} y2={yPos(max)} stroke="rgba(15,23,42,0.06)" strokeWidth={1} />
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#0b4a7d" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {/* Year dots */}
      {years.map((y, i) =>
        values[i] > 0 ? (
          <circle key={y} cx={x(y)} cy={yPos(values[i])} r={2} fill="#0b4a7d" />
        ) : (
          <circle key={y} cx={x(y)} cy={height / 2} r={1.5} fill="rgba(15,23,42,0.25)" />
        ),
      )}
    </svg>
  );
}

export default function HistoricalOpExPage() {
  const [entries, setEntries] = useState<HistoricalOpExEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/financials/historical-opex", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setEntries(j.entries ?? []))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => { alive = false; };
  }, []);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Historical Operating Expenses</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      <div className="card">
        <p className="muted small" style={{ marginBottom: 0 }}>
          Multi-year actuals by property and expense line. The budget
          viewer will reference this data to compute YoY variance and to
          surface long-run trends next to each expense line.
        </p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>Error</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      {!entries && !error && (
        <div className="card"><div className="muted small">Loading…</div></div>
      )}

      {entries && entries.length === 0 && (
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 6 }}>No historical operating expenses on file.</p>
          <p className="muted small">Drop a CSV / JSON to seed; or come back once entries are loaded.</p>
        </div>
      )}

      {entries && entries.map((entry) => (
        <EntryCard key={`${entry.propertyCode}-${entry.lineLabel}`} entry={entry} />
      ))}
    </main>
  );
}

function EntryCard({ entry }: { entry: HistoricalOpExEntry }) {
  const stats = useMemo(() => summarize(entry), [entry]);
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {entry.propertyCode} {entry.glAccount ? `· ${entry.glAccount}` : ""}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{entry.lineLabel}</div>
          {entry.source && <div className="muted small" style={{ marginTop: 2 }}>{entry.source}</div>}
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <Sparkline years={stats.years} values={stats.values} />
        </div>
      </div>

      <div className="pills" style={{ marginTop: 14 }}>
        {stats.earliest && stats.latest && (
          <StatPill label="Range" value={`${stats.earliest.year}–${stats.latest.year}`} sub={`${stats.nonZeroValues.length} obs`} />
        )}
        {stats.latest && <StatPill label={`Latest (${stats.latest.year})`} value={money(stats.latest.value)} />}
        {stats.recent3Avg != null && <StatPill label="Recent 3-yr avg" value={money(stats.recent3Avg)} />}
        <StatPill label="Long-run avg" value={money(stats.avg)} />
        <StatPill label="Min / max" value={`${money(stats.min)} / ${money(stats.max)}`} />
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th style={{ textAlign: "right" }}>vs Long-run avg</th>
            </tr>
          </thead>
          <tbody>
            {stats.years.map((y, i) => {
              const v = stats.values[i];
              const missing = v === 0;
              const delta = missing || stats.avg === 0 ? null : (v - stats.avg) / stats.avg;
              return (
                <tr key={y} style={{
                  opacity: missing ? 0.55 : 1,
                  color: missing ? "var(--muted)" : undefined,
                }}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{y}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {missing ? "— (no data)" : money(v)}
                  </td>
                  <td style={{
                    textAlign: "right", fontVariantNumeric: "tabular-nums",
                    color: delta == null ? undefined : delta > 0.10 ? "#b91c1c" : delta < -0.10 ? "#15803d" : undefined,
                  }}>
                    {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
