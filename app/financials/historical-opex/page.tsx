"use client";

import LoadingState from "@/app/components/LoadingState";
import { Fragment, useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { HistoricalOpExEntry } from "@/lib/financials/historical-opex/types";

const PROP_NAME = new Map(PROPERTY_DEFS.map((p) => [p.id.toUpperCase(), p.name]));

function money(n: number): string {
  if (n === 0) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

const isRetLine = (label: string) => /real estate tax/i.test(label);

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

type BudgetSummary = { year: number; byProperty: Record<string, { opex: number; ret: number }> };

export default function HistoricalOpExPage() {
  const [entries, setEntries] = useState<HistoricalOpExEntry[] | null>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/financials/historical-opex", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setEntries(j.entries ?? []))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"));
    // Budget column (2026 budgeted opex / RET per property) — best-effort.
    fetch("/api/financials/budgets/opex-summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j?.byProperty && setBudget(j))
      .catch(() => {});
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
        <LoadingState status="Loading expense history…" columns={4} rows={4} />
      )}

      {entries && entries.length === 0 && (
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 6 }}>No historical operating expenses on file.</p>
          <p className="muted small">Drop a CSV / JSON to seed; or come back once entries are loaded.</p>
        </div>
      )}

      {entries && entries.length > 0 && <SummaryTable entries={entries} budget={budget} />}

      {entries && entries.length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginTop: 6 }}>
          Property &amp; Line Detail
        </div>
      )}

      {entries && entries.map((entry) => (
        <EntryCard key={`${entry.propertyCode}-${entry.lineLabel}`} entry={entry} />
      ))}
    </main>
  );
}

// ── All-properties summary (Op Ex / RET / Total per year) ────────────────────

type PropRow = { code: string; name: string; byYear: Map<number, { opex: number; ret: number }> };

function buildSummary(entries: HistoricalOpExEntry[]): { rows: PropRow[]; years: number[] } {
  const byProp = new Map<string, Map<number, { opex: number; ret: number }>>();
  const yearSet = new Set<number>();
  for (const e of entries) {
    const ret = isRetLine(e.lineLabel);
    const pm = byProp.get(e.propertyCode) ?? new Map<number, { opex: number; ret: number }>();
    for (const [yStr, v] of Object.entries(e.yearly)) {
      const y = Number(yStr);
      if (!Number.isFinite(y) || typeof v !== "number") continue;
      yearSet.add(y);
      const cell = pm.get(y) ?? { opex: 0, ret: 0 };
      if (ret) cell.ret += v; else cell.opex += v;
      pm.set(y, cell);
    }
    byProp.set(e.propertyCode, pm);
  }
  const rows: PropRow[] = [...byProp.entries()]
    .map(([code, byYear]) => ({ code, name: PROP_NAME.get(code.toUpperCase()) ?? "", byYear }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const years = [...yearSet].sort((a, b) => b - a); // newest first
  return { rows, years };
}

function SummaryTable({ entries, budget }: { entries: HistoricalOpExEntry[]; budget: BudgetSummary | null }) {
  const { rows, years } = useMemo(() => buildSummary(entries), [entries]);
  const shown = years.slice(0, 6); // six most recent actual years on screen

  // Rows = union of properties with actuals and properties with a budget.
  const allRows = useMemo(() => {
    const codes = new Set(rows.map((r) => r.code));
    const merged = [...rows];
    if (budget) {
      for (const code of Object.keys(budget.byProperty)) {
        if (!codes.has(code)) merged.push({ code, name: PROP_NAME.get(code.toUpperCase()) ?? "", byYear: new Map() });
      }
    }
    return merged.sort((a, b) => a.code.localeCompare(b.code));
  }, [rows, budget]);

  const cell = (r: PropRow, y: number) => r.byYear.get(y) ?? { opex: 0, ret: 0 };
  const bud = (code: string) => budget?.byProperty[code.toUpperCase()] ?? null;
  const byr = budget?.year;

  function exportCSV() {
    const head = ["Property", "Name"];
    if (byr) head.push(`${byr} Budget Op Ex`, `${byr} Budget RET`, `${byr} Budget Total`);
    for (const y of years) head.push(`${y} Op Ex`, `${y} RET`, `${y} Total`);
    const lines = [head.join(",")];
    for (const r of allRows) {
      const cols: (string | number)[] = [r.code, `"${r.name}"`];
      if (byr) { const b = bud(r.code); cols.push(Math.round(b?.opex ?? 0), Math.round(b?.ret ?? 0), Math.round((b?.opex ?? 0) + (b?.ret ?? 0))); }
      for (const y of years) { const c = cell(r, y); cols.push(Math.round(c.opex), Math.round(c.ret), Math.round(c.opex + c.ret)); }
      lines.push(cols.join(","));
    }
    downloadCSV(`Expense_History_Summary.csv`, lines.join("\n"));
  }

  const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", padding: "6px 10px" };
  const grp: React.CSSProperties = { ...num, borderLeft: "1px solid var(--border)" };
  const budTint = "rgba(11,74,125,0.05)";

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>All Properties — Expense Summary</div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {byr ? `${byr} budget` : "Budget"} vs. historical actuals — operating expenses, real estate taxes, and total per property. Showing the {shown.length} most recent actual years; download for the full history.
          </div>
        </div>
        <button onClick={exportCSV} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>Download CSV</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--border)" }} />
            {byr && <th colSpan={3} style={{ textAlign: "center", padding: "4px 10px", fontSize: 13, fontWeight: 800, borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: budTint, color: "#0b4a7d" }}>{byr} Budget</th>}
            {shown.map((y) => (
              <th key={y} colSpan={3} style={{ textAlign: "center", padding: "4px 10px", fontSize: 13, fontWeight: 800, borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>{y}</th>
            ))}
          </tr>
          <tr style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)" }}>
            <th style={{ textAlign: "left", padding: "4px 10px", borderBottom: "1px solid var(--border)" }}>Property</th>
            {byr && (
              <Fragment>
                <th style={{ ...grp, fontSize: 11, background: budTint }}>Op Ex</th>
                <th style={{ ...num, fontSize: 11, background: budTint }}>RET</th>
                <th style={{ ...num, fontSize: 11, fontWeight: 800, background: budTint }}>Total</th>
              </Fragment>
            )}
            {shown.map((y) => (
              <Fragment key={y}>
                <th style={{ ...grp, fontSize: 11 }}>Op Ex</th>
                <th style={{ ...num, fontSize: 11 }}>RET</th>
                <th style={{ ...num, fontSize: 11, fontWeight: 800 }}>Total</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRows.map((r) => {
            const b = bud(r.code);
            return (
            <tr key={r.code} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ textAlign: "left", padding: "6px 10px", whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 12 }}>{r.code}</span>
                {r.name && <span className="muted" style={{ marginLeft: 8, fontSize: 12.5 }}>{r.name}</span>}
              </td>
              {byr && (
                <Fragment>
                  <td style={{ ...grp, background: budTint }}>{money(b?.opex ?? 0)}</td>
                  <td style={{ ...num, background: budTint }}>{money(b?.ret ?? 0)}</td>
                  <td style={{ ...num, fontWeight: 800, background: budTint }}>{money((b?.opex ?? 0) + (b?.ret ?? 0))}</td>
                </Fragment>
              )}
              {shown.map((y) => {
                const c = cell(r, y);
                return (
                  <Fragment key={y}>
                    <td style={grp}>{money(c.opex)}</td>
                    <td style={num}>{money(c.ret)}</td>
                    <td style={{ ...num, fontWeight: 800 }}>{money(c.opex + c.ret)}</td>
                  </Fragment>
                );
              })}
            </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ textAlign: "left", padding: "6px 10px" }}>Portfolio Total</td>
            {byr && (() => {
              const o = allRows.reduce((s, r) => s + (bud(r.code)?.opex ?? 0), 0);
              const rt = allRows.reduce((s, r) => s + (bud(r.code)?.ret ?? 0), 0);
              return (
                <Fragment>
                  <td style={{ ...grp, background: budTint }}>{money(o)}</td>
                  <td style={{ ...num, background: budTint }}>{money(rt)}</td>
                  <td style={{ ...num, background: budTint }}>{money(o + rt)}</td>
                </Fragment>
              );
            })()}
            {shown.map((y) => {
              const opex = allRows.reduce((s, r) => s + cell(r, y).opex, 0);
              const ret = allRows.reduce((s, r) => s + cell(r, y).ret, 0);
              return (
                <Fragment key={y}>
                  <td style={grp}>{money(opex)}</td>
                  <td style={num}>{money(ret)}</td>
                  <td style={{ ...num }}>{money(opex + ret)}</td>
                </Fragment>
              );
            })}
          </tr>
        </tfoot>
      </table>
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
        Budget = the {byr ?? "budget"} reimbursable operating-expense lines; actuals from the CAM reconciliation workbooks. Op Ex = operating lines, RET = real estate taxes, Total = both. More properties and years populate as workbooks load.
      </p>
    </div>
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
