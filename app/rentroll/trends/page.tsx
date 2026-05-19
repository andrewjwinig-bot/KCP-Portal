"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RentRollData, RentRollUnit } from "../../../lib/rentroll/parseRentRollExcel";
import type { RentRollSnapshotSummary, GroupKey, GroupTotals } from "../../../lib/rentroll/snapshot";
import { TREND_GROUPS } from "../../../lib/rentroll/snapshot";
import { PROPERTY_DEFS } from "../../../lib/properties/data";

const COLORS: Record<GroupKey, string> = {
  total: "#0b4a7d",
  jv3:   "#d97706",
  ni:    "#a16207",
  sc:    "#16a34a",
  kh:    "#7c3aed",
};

const HORIZONS = [
  { key: "ytd",  label: "YTD" },
  { key: "12mo", label: "Last 12 mo" },
  { key: "24mo", label: "Last 24 mo" },
  { key: "all",  label: "All / Calendar" },
] as const;
type Horizon = (typeof HORIZONS)[number]["key"];

function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const mNum = parseInt(m, 10);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[mNum - 1]} '${y.slice(2)}`;
}

function sqftFmt(n: number) { return n.toLocaleString(); }
function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function dollar(n: number): string {
  return `$${n.toFixed(2)}`;
}
function pct(n: number): string { return `${n.toFixed(1)}%`; }

function filterByHorizon(snapshots: RentRollSnapshotSummary[], horizon: Horizon): RentRollSnapshotSummary[] {
  if (horizon === "all" || snapshots.length === 0) return snapshots;
  const now = new Date();
  let cutoff: Date;
  if (horizon === "ytd")  cutoff = new Date(now.getFullYear(), 0, 1);
  else if (horizon === "12mo") cutoff = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
  else cutoff = new Date(now.getFullYear() - 2, now.getMonth() + 1, 1);
  return snapshots.filter((s) => {
    const [y, m] = s.month.split("-").map(Number);
    return new Date(y, m - 1, 1) >= cutoff;
  });
}

export default function TrendsPage() {
  const [snapshots, setSnapshots] = useState<RentRollSnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroups, setActiveGroups] = useState<Set<GroupKey>>(new Set(["total", "jv3", "ni", "sc", "kh"]));
  const [horizon, setHorizon] = useState<Horizon>("12mo");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupKey>("total");
  const [drilldown, setDrilldown] = useState<{ month: string; group: GroupKey; data: RentRollData | null; loading: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);

  function reloadHistory() {
    return fetch("/api/rentroll/history").then((r) => r.json()).then((j) => setSnapshots(j.snapshots ?? []));
  }

  useEffect(() => {
    reloadHistory().finally(() => setLoading(false));
  }, []);

  async function uploadHistorical(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadError(null);
    setUploadOk(null);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("Failed to read file"));
        r.onload = () => {
          const v = r.result;
          if (typeof v !== "string") return reject(new Error("Unexpected FileReader result"));
          const i = v.indexOf(",");
          resolve(i >= 0 ? v.slice(i + 1) : v);
        };
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/rentroll/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Upload failed");
      setUploadOk(`Saved ${j.month}`);
      await reloadHistory();
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteSnapshot(month: string) {
    if (!confirm(`Delete the ${month} snapshot? The current rent roll on /rentroll is not affected.`)) return;
    try {
      const res = await fetch(`/api/rentroll/history/${month}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await reloadHistory();
      if (drilldown?.month === month) setDrilldown(null);
    } catch (err: any) {
      alert(err?.message ?? "Delete failed");
    }
  }

  function toggleGroup(k: GroupKey) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      if (next.size === 0) next.add(k); // keep at least one
      return next;
    });
  }

  async function openDrill(month: string, group: GroupKey) {
    setSelectedMonth(month);
    setSelectedGroup(group);
    setDrilldown({ month, group, data: null, loading: true });
    try {
      const r = await fetch(`/api/rentroll/history/${month}`);
      if (!r.ok) throw new Error("Snapshot not found");
      const j = await r.json();
      setDrilldown({ month, group, data: j.rentroll, loading: false });
    } catch {
      setDrilldown({ month, group, data: null, loading: false });
    }
  }

  // Filter snapshots based on the selected time horizon (used by every
  // chart on the page).
  const visibleSnapshots = useMemo(() => filterByHorizon(snapshots, horizon), [snapshots, horizon]);

  // ── Chart geometry ──
  const chart = useMemo(() => {
    const W = 760;
    const H = 280;
    const padL = 44, padR = 16, padT = 12, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const xs = (i: number, n: number) => n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
    const ys = (pct: number) => padT + innerH - (Math.max(0, Math.min(100, pct)) / 100) * innerH;
    return { W, H, padL, padR, padT, padB, innerW, innerH, xs, ys };
  }, []);

  // ── KPI tiles (current vs YoY) ─────────────────────────────────────────
  const kpis = useMemo(() => {
    if (snapshots.length === 0) return null;
    const last = snapshots[snapshots.length - 1];
    // Find a snapshot ~12 months earlier for YoY comparison.
    const [ly, lm] = last.month.split("-").map(Number);
    const yoyKey = `${ly - 1}-${String(lm).padStart(2, "0")}`;
    const yoy = snapshots.find((s) => s.month === yoyKey) ?? null;
    function delta(now: number, prev: number | undefined): { value: number | null; pct: number | null } {
      if (prev == null || prev === 0) return { value: null, pct: null };
      return { value: now - prev, pct: (now - prev) / prev };
    }
    const t = last.totals.total;
    const tPrev = yoy?.totals.total;
    return { last, yoy, t, tPrev, delta };
  }, [snapshots]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ margin: 0 }}>Rent Roll Trend <span style={{ color: "#dc2626" }}>&ndash; DRAFT</span></h1>
          <Link href="/rentroll" style={{ fontSize: 13, color: "#0b4a7d", textDecoration: "none" }}>← Rent roll</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <label
            className="btn"
            style={{ cursor: "pointer", margin: 0 }}
            title="Adds a historical snapshot for charts. Does NOT change the current rent roll on /rentroll."
          >
            {uploading ? "Uploading…" : "Upload past month"}
            <input type="file" accept=".xls,.xlsx" onChange={uploadHistorical} disabled={uploading} style={{ display: "none" }} />
          </label>
          <a href="/api/rentroll/trends/export" className="btn">Export Excel</a>
        </div>
      </header>
      <div className="muted small" style={{ marginTop: -4 }}>
        Use <b>Upload past month</b> to add older rent rolls for trends — the current rent roll on /rentroll stays put.
      </div>

      {/* Horizon toggle */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Window</span>
        <div role="tablist" style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden", background: "var(--card)" }}>
          {HORIZONS.map((h) => {
            const active = horizon === h.key;
            return (
              <button
                key={h.key}
                onClick={() => setHorizon(h.key)}
                role="tab"
                aria-selected={active}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 700,
                  background: active ? "var(--brand)" : "transparent",
                  color: active ? "#fff" : "var(--text)",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >{h.label}</button>
            );
          })}
        </div>
        <span className="muted small" style={{ marginLeft: 4 }}>
          {visibleSnapshots.length} {visibleSnapshots.length === 1 ? "snapshot" : "snapshots"}{snapshots.length !== visibleSnapshots.length ? ` of ${snapshots.length}` : ""}
        </span>
      </div>

      {/* ── KPI tiles ── */}
      {kpis && (
        <KpiTiles last={kpis.last} yoy={kpis.yoy} />
      )}

      {(uploadError || uploadOk) && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 13,
          background: uploadError ? "rgba(220,38,38,0.06)" : "rgba(22,163,74,0.06)",
          border: `1px solid ${uploadError ? "rgba(220,38,38,0.3)" : "rgba(22,163,74,0.3)"}`,
          color: uploadError ? "#b91c1c" : "#166534",
        }}>
          {uploadError ?? uploadOk}
        </div>
      )}

      {/* ── Chart card ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <b style={{ fontSize: 17 }}>% Occupied — Month over Month</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TREND_GROUPS.map((g) => {
              const k = g.key as GroupKey;
              const active = activeGroups.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleGroup(k)}
                  style={{
                    fontSize: 12, padding: "5px 12px", borderRadius: 999,
                    border: `1.5px solid ${active ? COLORS[k] : "var(--border)"}`,
                    background: active ? `${COLORS[k]}14` : "transparent",
                    color: active ? COLORS[k] : "var(--muted)",
                    cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[k] }} />
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="muted small">Loading…</div>
        ) : visibleSnapshots.length === 0 ? (
          <div className="muted small">No rent roll history in this window. Adjust the horizon or upload a rent roll.</div>
        ) : (
          <>
            <svg width="100%" viewBox={`0 0 ${chart.W} ${chart.H}`} style={{ overflow: "visible" }}>
              {/* Y axis grid */}
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line x1={chart.padL} x2={chart.W - chart.padR} y1={chart.ys(v)} y2={chart.ys(v)} stroke="rgba(15,23,42,0.08)" strokeWidth={1} />
                  <text x={chart.padL - 6} y={chart.ys(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end">{v}%</text>
                </g>
              ))}

              {/* X axis labels */}
              {visibleSnapshots.map((s, i) => (
                <text key={s.month} x={chart.xs(i, visibleSnapshots.length)} y={chart.H - chart.padB + 16} fontSize={10} fill="var(--muted)" textAnchor="middle">
                  {fmtMonth(s.month)}
                </text>
              ))}

              {/* Lines */}
              {TREND_GROUPS.filter((g) => activeGroups.has(g.key as GroupKey)).map((g) => {
                const k = g.key as GroupKey;
                const path = visibleSnapshots.map((s, i) => {
                  const x = chart.xs(i, visibleSnapshots.length);
                  const y = chart.ys(s.totals[k]?.pct ?? 0);
                  return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(" ");
                return (
                  <g key={k}>
                    <path d={path} fill="none" stroke={COLORS[k]} strokeWidth={2.5} />
                    {visibleSnapshots.map((s, i) => {
                      const x = chart.xs(i, visibleSnapshots.length);
                      const y = chart.ys(s.totals[k]?.pct ?? 0);
                      const isSelected = selectedMonth === s.month && selectedGroup === k;
                      return (
                        <circle
                          key={i}
                          cx={x} cy={y} r={isSelected ? 6 : 4}
                          fill={COLORS[k]}
                          stroke="#fff" strokeWidth={2}
                          style={{ cursor: "pointer" }}
                          onClick={() => openDrill(s.month, k)}
                        >
                          <title>{`${g.label} — ${fmtMonth(s.month)} — ${(s.totals[k]?.pct ?? 0).toFixed(2)}%`}</title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </>
        )}
      </div>

      {/* ── Multi-metric grid (Occupied SF, Gross Rent, Avg PSF, Expirations) ── */}
      {visibleSnapshots.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
          <MetricChart
            title="Occupied SF — Month over Month"
            unit="sf"
            snapshots={visibleSnapshots}
            activeGroups={activeGroups}
            extract={(t: GroupTotals | undefined) => t?.occupied ?? 0}
            fmt={(v) => v.toLocaleString()}
          />
          <MetricChart
            title="Gross Rent / mo — Month over Month"
            unit="$"
            snapshots={visibleSnapshots}
            activeGroups={activeGroups}
            extract={(t) => t?.grossRentMonth ?? 0}
            fmt={money}
          />
          <MetricChart
            title="Avg Rent PSF — Annualized"
            unit="$/sf"
            snapshots={visibleSnapshots}
            activeGroups={activeGroups}
            extract={(t) => t?.avgRentPsf ?? 0}
            fmt={dollar}
          />
          <ExpirationsChart snapshots={visibleSnapshots} activeGroups={activeGroups} />
        </div>
      )}

      {/* ── Per-building sparklines ── */}
      {visibleSnapshots.length > 1 && (
        <BuildingSparklines snapshots={visibleSnapshots} />
      )}

      {/* ── Summary table ── */}
      {snapshots.length > 0 && (
        <div className="card">
          <b style={{ fontSize: 17 }}>Snapshots</b>
          <div className="tableWrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  {TREND_GROUPS.map((g) => <th key={g.key} style={{ textAlign: "right" }}>{g.label}<br /><span style={{ fontWeight: 400, fontSize: 11, color: "var(--muted)" }}>occ % / sf</span></th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.month}>
                    <td style={{ fontWeight: 600 }}>{fmtMonth(s.month)}</td>
                    {TREND_GROUPS.map((g) => {
                      const k = g.key as GroupKey;
                      const t = s.totals[k];
                      if (!t || t.total === 0) return <td key={k} style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>—</td>;
                      return (
                        <td key={k} style={{ textAlign: "right", fontSize: 13, cursor: "pointer" }} onClick={() => openDrill(s.month, k)}>
                          <b style={{ color: COLORS[k] }}>{t.pct.toFixed(2)}%</b>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{sqftFmt(t.occupied)} / {sqftFmt(t.total)}</div>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => deleteSnapshot(s.month)}
                        title="Delete this snapshot"
                        style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "1px solid #b42318", background: "transparent", color: "#b42318", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Drilldown card ── */}
      {drilldown && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <b style={{ fontSize: 17 }}>
              Tenants — {fmtMonth(drilldown.month)} · {TREND_GROUPS.find((g) => g.key === drilldown.group)?.label}
            </b>
            <button onClick={() => { setDrilldown(null); setSelectedMonth(null); }}
                    style={{ fontSize: 13, padding: "5px 14px", borderRadius: 7, border: "1px solid #1a1a1a", background: "transparent", cursor: "pointer", fontWeight: 500 }}>
              Close
            </button>
          </div>
          {drilldown.loading ? (
            <div className="muted small">Loading…</div>
          ) : !drilldown.data ? (
            <div className="muted small">Snapshot not found.</div>
          ) : (() => {
            const groupCodes = TREND_GROUPS.find((g) => g.key === drilldown.group)?.codes;
            const props = groupCodes
              ? drilldown.data.properties.filter((p) => groupCodes.has(p.propertyCode.toUpperCase()))
              : drilldown.data.properties;
            const allUnits: { code: string; unit: RentRollUnit }[] = props.flatMap((p) => p.units.map((u) => ({ code: p.propertyCode, unit: u })));
            return (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Unit</th>
                      <th>Tenant</th>
                      <th style={{ textAlign: "right" }}>Sq Ft</th>
                      <th>Lease From</th>
                      <th>Lease To</th>
                      <th style={{ textAlign: "right" }}>Base Rent /mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUnits.map(({ code, unit }, i) => (
                      <tr key={i} style={{ background: unit.isVacant ? "rgba(15,23,42,0.025)" : undefined }}>
                        <td style={{ fontSize: 13, color: "var(--muted)" }}>{code}</td>
                        <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 12, whiteSpace: "nowrap" }}>{unit.unitRef}</code></td>
                        <td style={{ fontWeight: unit.isVacant ? 400 : 600, color: unit.isVacant ? "var(--muted)" : "var(--text)", fontStyle: unit.isVacant ? "italic" : "normal" }}>
                          {unit.isVacant ? "Vacant" : unit.occupantName}
                        </td>
                        <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                        <td style={{ fontSize: 13, color: "var(--muted)" }}>{unit.leaseFrom ?? "—"}</td>
                        <td style={{ fontSize: 13 }}>{unit.leaseTo ?? "—"}</td>
                        <td style={{ textAlign: "right", fontSize: 13 }}>{unit.baseRent ? `$${unit.baseRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </main>
  );
}

// ─── KPI tiles ─────────────────────────────────────────────────────────────

function KpiTiles({ last, yoy }: { last: RentRollSnapshotSummary; yoy: RentRollSnapshotSummary | null }) {
  const t = last.totals.total;
  const p = yoy?.totals.total;
  function deltaPctTile(now: number, prev: number | undefined) {
    if (prev == null) return null;
    if (prev === 0) return null;
    return (now - prev) / prev;
  }
  function deltaAbs(now: number, prev: number | undefined) {
    if (prev == null) return null;
    return now - prev;
  }
  const tiles = [
    {
      label: "Occupancy",
      value: pct(t.pct),
      sub: `${sqftFmt(t.occupied)} / ${sqftFmt(t.total)} sf`,
      delta: deltaAbs(t.pct, p?.pct),
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`,
      goodIfPositive: true,
    },
    {
      label: "Total SF",
      value: sqftFmt(t.total),
      sub: `${t.unitCount} units`,
      delta: deltaPctTile(t.total, p?.total),
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`,
      goodIfPositive: true,
    },
    {
      label: "Gross Rent / mo",
      value: money(t.grossRentMonth),
      sub: `${money(t.grossRentMonth * 12)} / yr`,
      delta: deltaPctTile(t.grossRentMonth, p?.grossRentMonth),
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`,
      goodIfPositive: true,
    },
    {
      label: "Avg Rent PSF",
      value: dollar(t.avgRentPsf),
      sub: "annualized · occupied",
      delta: deltaPctTile(t.avgRentPsf, p?.avgRentPsf),
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`,
      goodIfPositive: true,
    },
    {
      label: "Expiring ≤ 90 d",
      value: String(t.expiring90),
      sub: `${t.expiring180} ≤180d · ${t.expiring365} ≤365d`,
      delta: deltaAbs(t.expiring90, p?.expiring90),
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${d}`,
      goodIfPositive: false,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
      {tiles.map((tile) => {
        let toneColor = "var(--muted)";
        if (tile.delta != null) {
          const isUp = tile.delta > 0;
          const isFlat = Math.abs(tile.delta) < 0.0001;
          if (!isFlat) {
            const positive = (isUp && tile.goodIfPositive) || (!isUp && !tile.goodIfPositive);
            toneColor = positive ? "#16a34a" : "#dc2626";
          }
        }
        return (
          <div key={tile.label} className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>{tile.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, lineHeight: 1.1 }}>{tile.value}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{tile.sub}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: toneColor, marginTop: 6 }}>
              {tile.delta == null ? "no YoY data" : `${tile.deltaFmt(tile.delta)} vs YoY`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Generic line chart for a metric ───────────────────────────────────────

function MetricChart({
  title, unit, snapshots, activeGroups, extract, fmt,
}: {
  title: string;
  unit: string;
  snapshots: RentRollSnapshotSummary[];
  activeGroups: Set<GroupKey>;
  extract: (t: GroupTotals | undefined) => number;
  fmt: (v: number) => string;
}) {
  const W = 480, H = 220;
  const padL = 56, padR = 14, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const series = TREND_GROUPS
    .filter((g) => activeGroups.has(g.key as GroupKey))
    .map((g) => {
      const k = g.key as GroupKey;
      return {
        key: k,
        label: g.label,
        values: snapshots.map((s) => extract(s.totals[k])),
      };
    });

  const max = Math.max(0.001, ...series.flatMap((s) => s.values));
  const xs = (i: number) => snapshots.length <= 1 ? padL + innerW / 2 : padL + (i / (snapshots.length - 1)) * innerW;
  const ys = (v: number) => padT + innerH - (v / max) * innerH;

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {/* y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = max * f;
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke="rgba(15,23,42,0.07)" />
              <text x={padL - 6} y={ys(v) + 4} fontSize={9} fill="var(--muted)" textAnchor="end">{fmt(v)}</text>
            </g>
          );
        })}
        {/* x labels — show first / middle / last to keep things clean */}
        {snapshots.map((s, i) => {
          const showLabel = i === 0 || i === snapshots.length - 1 || (snapshots.length <= 6) || i === Math.floor(snapshots.length / 2);
          if (!showLabel) return null;
          return (
            <text key={s.month} x={xs(i)} y={H - padB + 14} fontSize={9} fill="var(--muted)" textAnchor="middle">
              {fmtMonth(s.month)}
            </text>
          );
        })}
        {/* Lines */}
        {series.map((s) => {
          const path = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={COLORS[s.key]} strokeWidth={2} />
              {s.values.map((v, i) => (
                <circle key={i} cx={xs(i)} cy={ys(v)} r={3} fill={COLORS[s.key]} stroke="#fff" strokeWidth={1.5}>
                  <title>{`${s.label} — ${fmtMonth(snapshots[i].month)} — ${fmt(v)}${unit ? " " + unit : ""}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Lease expirations stacked bars (90 / 180 / 365 day buckets) ───────────

function ExpirationsChart({ snapshots, activeGroups }: { snapshots: RentRollSnapshotSummary[]; activeGroups: Set<GroupKey> }) {
  // Use the most-aggregated active group (total preferred) so the chart
  // stays readable. Fall back to whatever's first if total isn't active.
  const k: GroupKey = activeGroups.has("total") ? "total" : (TREND_GROUPS.find((g) => activeGroups.has(g.key as GroupKey))?.key as GroupKey) ?? "total";

  const W = 480, H = 220;
  const padL = 36, padR = 14, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...snapshots.map((s) => s.totals[k]?.expiring365 ?? 0));
  const barWidth = Math.max(8, (innerW / Math.max(1, snapshots.length)) * 0.6);

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Lease Expirations as of Snapshot</div>
        <div className="muted small">Group: {TREND_GROUPS.find((g) => g.key === k)?.label}</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map((f) => {
          const v = max * f;
          const y = padT + innerH - f * innerH;
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="rgba(15,23,42,0.07)" />
              <text x={padL - 6} y={y + 4} fontSize={9} fill="var(--muted)" textAnchor="end">{Math.round(v)}</text>
            </g>
          );
        })}
        {snapshots.map((s, i) => {
          const t = s.totals[k];
          if (!t) return null;
          const cx = snapshots.length <= 1 ? padL + innerW / 2 : padL + (i / (snapshots.length - 1)) * innerW;
          const x = cx - barWidth / 2;
          const h365 = ((t.expiring365 - t.expiring180) / max) * innerH;
          const h180 = ((t.expiring180 - t.expiring90)  / max) * innerH;
          const h90  = (t.expiring90 / max) * innerH;
          const baseY = padT + innerH;
          return (
            <g key={s.month}>
              <rect x={x} y={baseY - h90} width={barWidth} height={h90} fill="#dc2626">
                <title>{`${fmtMonth(s.month)} · ≤90d: ${t.expiring90}`}</title>
              </rect>
              <rect x={x} y={baseY - h90 - h180} width={barWidth} height={h180} fill="#d97706">
                <title>{`${fmtMonth(s.month)} · 90-180d: ${t.expiring180 - t.expiring90}`}</title>
              </rect>
              <rect x={x} y={baseY - h90 - h180 - h365} width={barWidth} height={h365} fill="#0b4a7d">
                <title>{`${fmtMonth(s.month)} · 180-365d: ${t.expiring365 - t.expiring180}`}</title>
              </rect>
              <text x={cx} y={H - padB + 14} fontSize={9} fill="var(--muted)" textAnchor="middle">{fmtMonth(s.month)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 11, marginTop: 8, color: "var(--muted)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#dc2626", borderRadius: 2, marginRight: 4 }} />≤ 90 d</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#d97706", borderRadius: 2, marginRight: 4 }} />90 – 180 d</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0b4a7d", borderRadius: 2, marginRight: 4 }} />180 – 365 d</span>
      </div>
    </div>
  );
}

// ─── Per-building sparklines grid ──────────────────────────────────────────

function BuildingSparklines({ snapshots }: { snapshots: RentRollSnapshotSummary[] }) {
  // Collect every property code that appears in any snapshot's byProperty.
  const codes = useMemo(() => {
    const seen = new Set<string>();
    for (const s of snapshots) for (const p of s.byProperty ?? []) seen.add(p.propertyCode.toUpperCase());
    return [...seen].sort();
  }, [snapshots]);

  function nameFor(code: string) {
    const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code);
    return def?.name ?? code;
  }

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Per-Building Trajectory</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>Occupancy % over the selected window. Hover for snapshot values.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {codes.map((code) => {
          const points = snapshots.map((s) => s.byProperty?.find((p) => p.propertyCode.toUpperCase() === code));
          const occ = points.map((p) => p?.pct ?? 0);
          const last = points[points.length - 1];
          const first = points[0];
          const trendDelta = last && first ? (last.pct - first.pct) : 0;
          return (
            <div key={code} style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{code}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameFor(code)}</span>
              </div>
              <Sparkline values={occ} height={36} color="#0b4a7d" max={100} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                <span style={{ color: "var(--muted)" }}>{last ? `${last.pct.toFixed(1)}%` : "—"}</span>
                <span style={{ color: trendDelta > 0.05 ? "#16a34a" : trendDelta < -0.05 ? "#dc2626" : "var(--muted)", fontWeight: 600 }}>
                  {trendDelta === 0 ? "±0" : `${trendDelta > 0 ? "+" : ""}${trendDelta.toFixed(1)} pts`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ values, height = 28, color = "#0b4a7d", max }: { values: number[]; height?: number; color?: string; max?: number }) {
  const W = 120;
  const m = max ?? Math.max(0.001, ...values);
  const xs = (i: number) => values.length <= 1 ? W / 2 : (i / (values.length - 1)) * W;
  const ys = (v: number) => height - (v / m) * (height - 4) - 2;
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: "block", marginTop: 4 }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} />
      {values.map((v, i) => (
        <circle key={i} cx={xs(i)} cy={ys(v)} r={1.5} fill={color}>
          <title>{`${v.toFixed(1)}%`}</title>
        </circle>
      ))}
    </svg>
  );
}
