"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RentRollData, RentRollUnit } from "../../../lib/rentroll/parseRentRollExcel";
import type { RentRollSnapshotSummary, GroupKey } from "../../../lib/rentroll/snapshot";
import { TREND_GROUPS } from "../../../lib/rentroll/snapshot";

const COLORS: Record<GroupKey, string> = {
  total: "#0b4a7d",
  jv3:   "#d97706",
  ni:    "#a16207",
  sc:    "#16a34a",
  kh:    "#7c3aed",
};

function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const mNum = parseInt(m, 10);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[mNum - 1]} '${y.slice(2)}`;
}

function sqftFmt(n: number) { return n.toLocaleString(); }

export default function TrendsPage() {
  const [snapshots, setSnapshots] = useState<RentRollSnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroups, setActiveGroups] = useState<Set<GroupKey>>(new Set(["total", "jv3", "ni", "sc", "kh"]));
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

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ margin: 0 }}>Rent Roll Trend</h1>
          <Link href="/rentroll" style={{ fontSize: 13, color: "#0b4a7d", textDecoration: "none" }}>← Rent roll</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <label className="btn" style={{ cursor: "pointer", margin: 0 }}>
            {uploading ? "Uploading…" : "Upload past month"}
            <input type="file" accept=".xls,.xlsx" onChange={uploadHistorical} disabled={uploading} style={{ display: "none" }} />
          </label>
          <a href="/api/rentroll/trends/export" className="btn">Export Excel</a>
        </div>
      </header>

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
        ) : snapshots.length === 0 ? (
          <div className="muted small">No rent roll history yet. Upload a rent roll to start the trend.</div>
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
              {snapshots.map((s, i) => (
                <text key={s.month} x={chart.xs(i, snapshots.length)} y={chart.H - chart.padB + 16} fontSize={10} fill="var(--muted)" textAnchor="middle">
                  {fmtMonth(s.month)}
                </text>
              ))}

              {/* Lines */}
              {TREND_GROUPS.filter((g) => activeGroups.has(g.key as GroupKey)).map((g) => {
                const k = g.key as GroupKey;
                const path = snapshots.map((s, i) => {
                  const x = chart.xs(i, snapshots.length);
                  const y = chart.ys(s.totals[k]?.pct ?? 0);
                  return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(" ");
                return (
                  <g key={k}>
                    <path d={path} fill="none" stroke={COLORS[k]} strokeWidth={2.5} />
                    {snapshots.map((s, i) => {
                      const x = chart.xs(i, snapshots.length);
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
