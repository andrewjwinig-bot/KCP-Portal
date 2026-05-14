"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type MaintenanceRequest,
} from "@/lib/maintenance/requests";
import { STAFF } from "@/lib/maintenance/staff";

// Standalone Maintenance Reports page. Linked from the Sidebar as a
// sub-item under Maintenance.

type Window = "7" | "30" | "90" | "all";
type Scope = "active" | "all";

const ACCENT_BLUE   = "#0b4a7d";
const ACCENT_GREEN  = "#15803d";
const ACCENT_PURPLE = "#7c3aed";
const ACCENT_AMBER  = "#b45309";
const ACCENT_RED    = "#b91c1c";

// Distinct, slightly muted palette for multi-category charts (pie / donut /
// vertical bars). 18 entries — wraps if more categories show up.
const PALETTE = [
  "#7eb6e6", "#e7826b", "#7fd1c8", "#b4a8e0", "#f3b86e",
  "#94c977", "#e08aa6", "#c5dca4", "#9bbeed", "#d4a5ce",
  "#fbd97e", "#9fd4ef", "#e8a094", "#8fc8b8", "#c9bce8",
  "#bfd7eb", "#f2cc8f", "#a6cfe2",
];

export default function MaintenanceReportsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<Window>("30");
  const [scope, setScope] = useState<Scope>("all");

  useEffect(() => {
    let alive = true;
    fetch("/api/maintenance/requests")
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) { setError(body.error ?? "Failed to load"); setRequests([]); }
        else setRequests(body.requests ?? []);
      })
      .catch((e) => alive && setError(e?.message ?? "Network error"));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const cutoff = window === "all" ? 0 : Date.now() - Number(window) * 86400000;
    return requests.filter((r) => {
      if (scope === "active" && r.status === "Complete") return false;
      if (cutoff) {
        const t = Date.parse(r.submittedDate || r.createdAt);
        if (Number.isFinite(t) && t < cutoff) return false;
      }
      return true;
    });
  }, [requests, window, scope]);

  // ── KPI tiles ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const all = filtered;
    const active = all.filter((r) => r.status !== "Complete");
    const completed = all.filter((r) => r.status === "Complete");
    const highOpen = active.filter((r) => r.priority === "High").length;
    const medOpen  = active.filter((r) => r.priority === "Medium").length;
    const lowOpen  = active.filter((r) => r.priority === "Low").length;
    const unset    = active.filter((r) => !r.priority).length;

    const now = Date.now();
    const openAges = active
      .map((r) => agedDays(r.submittedDate, now))
      .filter((d): d is number => d != null);
    const avgOpen = openAges.length
      ? openAges.reduce((s, x) => s + x, 0) / openAges.length
      : null;

    const closeTimes = completed
      .map((r) => agedDays(r.submittedDate, r.completedDate ? Date.parse(r.completedDate) : null))
      .filter((d): d is number => d != null);
    const avgClose = closeTimes.length
      ? closeTimes.reduce((s, x) => s + x, 0) / closeTimes.length
      : null;

    return {
      activeCount: active.length,
      completedCount: completed.length,
      highOpen, medOpen, lowOpen, unset,
      avgOpen,
      avgClose,
    };
  }, [filtered]);

  // ── Aging buckets (active requests) ───────────────────────────────────
  const aging = useMemo(() => {
    const now = Date.now();
    const buckets = [
      { label: "≤ 7 days",   min: 0,  max: 7,   n: 0 },
      { label: "8–14 days",  min: 8,  max: 14,  n: 0 },
      { label: "15–30 days", min: 15, max: 30,  n: 0 },
      { label: "31–60 days", min: 31, max: 60,  n: 0 },
      { label: "60+ days",   min: 61, max: Infinity, n: 0 },
    ];
    for (const r of filtered) {
      if (r.status === "Complete") continue;
      const d = agedDays(r.submittedDate, now);
      if (d == null) continue;
      const b = buckets.find((b) => d >= b.min && d <= b.max);
      if (b) b.n++;
    }
    return buckets;
  }, [filtered]);

  // ── Chart rollups ────────────────────────────────────────────────────
  // Strip the back-compat "<Property> — <Company>" suffix when the new
  // tenantCompany field isn't populated.
  const byProperty = useMemo(() => countBy(filtered, (r) => {
    const name = r.propertyName || "";
    if (r.tenantCompany) return name || "(none)";
    const m = name.match(/^(.+?)\s*—\s*(.+)$/);
    return (m ? m[1].trim() : name) || "(none)";
  }), [filtered]);
  const byCategory = useMemo(() => countBy(filtered, (r) => (r.categories.length ? r.categories : ["(uncategorized)"]), true), [filtered]);
  const byWorker   = useMemo(() => {
    const map = new Map<string, { label: string; n: number }>();
    for (const r of filtered) {
      const key = r.assignedTo ?? "_unassigned";
      const label = r.assignedTo ? (STAFF.find((s) => s.id === r.assignedTo)?.name ?? r.assignedTo) : "Unassigned";
      const v = map.get(key) ?? { label, n: 0 };
      v.n++;
      map.set(key, v);
    }
    return Array.from(map.values()).sort((a, b) => b.n - a.n);
  }, [filtered]);
  // "Tenant" on the report = the leased company (rent-roll occupant). For
  // older records that baked the company into propertyName as
  // "<Property> — <Company>", fall back to parsing it out.
  const byTenant = useMemo(
    () => countBy(filtered, (r) => {
      if (r.tenantCompany) return r.tenantCompany;
      const m = r.propertyName.match(/^(.+?)\s*—\s*(.+)$/);
      return m ? m[2].trim() : (r.tenantName || r.tenantEmail || "(unknown)");
    }),
    [filtered],
  );

  const total = filtered.length;

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Maintenance Reports</h1>
          <p className="muted small">Snapshot of the maintenance queue · filtered by window + scope</p>
        </div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: ACCENT_RED, marginBottom: 4 }}>Couldn&apos;t load requests</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "0 2px" }}>
        <Field label="Window">
          <select value={window} onChange={(e) => setWindow(e.target.value as Window)} style={selectStyle}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </Field>
        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={selectStyle}>
            <option value="all">All requests</option>
            <option value="active">Active only</option>
          </select>
        </Field>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", paddingBottom: 6 }}>
          {requests == null ? "Loading…" : `${total} request${total === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Kpi label="Active" value={kpis.activeCount} accent={ACCENT_BLUE} />
        <Kpi label="High Priority Open" value={kpis.highOpen} accent={ACCENT_RED} />
        <Kpi label="Avg Days Open" value={fmtDays(kpis.avgOpen)} accent={ACCENT_AMBER} />
        <Kpi label="Avg Days to Close" value={fmtDays(kpis.avgClose)} accent={ACCENT_GREEN} />
      </div>

      {/* Open by Priority */}
      <div className="card">
        <div style={sectionLabelStyle}>Open by Priority</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 10 }}>
          <PriorityCount label="High"     n={kpis.highOpen} color={ACCENT_RED} />
          <PriorityCount label="Medium"   n={kpis.medOpen}  color={ACCENT_AMBER} />
          <PriorityCount label="Low"      n={kpis.lowOpen}  color="#475569" />
          <PriorityCount label="No Priority Set" n={kpis.unset} color="#94a3b8" />
        </div>
      </div>

      {/* Aging buckets */}
      <ChartCard title="Aging — Active Requests">
        <HorizontalBars rows={aging} accent={ACCENT_AMBER} />
      </ChartCard>

      {/* 2-col grid: Property / Category */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14 }}>
        <ChartCard title="Property">
          <HorizontalBars rows={byProperty} accent={ACCENT_BLUE} />
        </ChartCard>
        <ChartCard title="Category">
          <PieWithLegend rows={byCategory} donut={false} />
        </ChartCard>
      </div>

      {/* 2-col grid: Worker / Priority */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14 }}>
        <ChartCard title="Worker">
          <PieWithLegend rows={byWorker} donut />
        </ChartCard>
        <ChartCard title="Open by Priority (chart)">
          <HorizontalBars
            rows={[
              { label: "High",   n: kpis.highOpen },
              { label: "Medium", n: kpis.medOpen },
              { label: "Low",    n: kpis.lowOpen },
              { label: "Unset",  n: kpis.unset },
            ]}
            accent={ACCENT_AMBER}
          />
        </ChartCard>
      </div>

      {/* Full-width Tenant vertical bars */}
      <ChartCard title="Tenant">
        <VerticalBars rows={byTenant} cap={40} />
      </ChartCard>
    </main>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

function agedDays(start: string | null | undefined, end: number | null): number | null {
  if (!start || end == null) return null;
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (end - t) / 86400000);
}

function fmtDays(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return "<1d";
  return `${d.toFixed(1)}d`;
}

function countBy(
  list: MaintenanceRequest[],
  pick: (r: MaintenanceRequest) => string | string[],
  multi = false,
): { label: string; n: number }[] {
  const map = new Map<string, number>();
  for (const r of list) {
    const v = pick(r);
    const keys = multi && Array.isArray(v) ? v : Array.isArray(v) ? v : [v];
    for (const k of keys) {
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n);
}

// ── primitive components ───────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={sectionLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function PriorityCount({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      border: "1px solid var(--border)", borderRadius: 8,
      background: "rgba(15,23,42,0.025)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{n}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={sectionLabelStyle}>{title}</div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

// ── Horizontal bars (used for Property / Aging / smaller breakdowns) ──

function HorizontalBars({ rows, accent }: { rows: { label: string; n: number }[]; accent: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0);
  if (!rows.length || rows.every((r) => r.n === 0)) {
    return <div className="muted small">No data in this window.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => {
        const pct = max === 0 ? 0 : (r.n / max) * 100;
        return (
          <div key={r.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                {r.label}
              </span>
              <span style={{ color: accent, fontWeight: 700 }}>{r.n}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(15,23,42,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: accent, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pie / Donut with side legend ──────────────────────────────────────

function PieWithLegend({ rows, donut }: { rows: { label: string; n: number }[]; donut: boolean }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return <div className="muted small">No data in this window.</div>;
  const size = 220;
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flexShrink: 0 }}>
        <PieSvg rows={rows} total={total} size={size} donut={donut} />
      </div>
      <ul style={{
        listStyle: "none", padding: 0, margin: 0,
        display: "flex", flexDirection: "column", gap: 5,
        fontSize: 13, flex: 1, minWidth: 180, maxHeight: size, overflowY: "auto",
      }}>
        {rows.map((r, i) => (
          <li key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: PALETTE[i % PALETTE.length], flexShrink: 0,
            }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.label}
            </span>
            <span style={{ color: "var(--muted)", fontWeight: 600 }}>{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PieSvg({
  rows, total, size, donut,
}: {
  rows: { label: string; n: number }[];
  total: number;
  size: number;
  donut: boolean;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const ri = donut ? r * 0.55 : 0;

  // Single-slice case: full ring/circle (otherwise the arc collapses to a line).
  if (rows.length === 1 || rows.filter((x) => x.n > 0).length === 1) {
    const row = rows.find((x) => x.n > 0) ?? rows[0];
    const color = PALETTE[0];
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={color} />
        {donut && <circle cx={cx} cy={cy} r={ri} fill="var(--card)" />}
        <title>{`${row.label}: ${row.n} (100%)`}</title>
      </svg>
    );
  }

  let acc = 0;
  const slices = rows.map((row, i) => {
    const pct = row.n / total;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    acc += pct;
    const a2 = acc * 2 * Math.PI - Math.PI / 2;
    return { row, i, a1, a2, pct };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map(({ row, i, a1, a2, pct }) => {
        if (row.n === 0) return null;
        const d = arcPath(cx, cy, r, ri, a1, a2);
        return (
          <path
            key={row.label}
            d={d}
            fill={PALETTE[i % PALETTE.length]}
            stroke="var(--card)"
            strokeWidth={1.5}
          >
            <title>{`${row.label}: ${row.n} (${(pct * 100).toFixed(1)}%)`}</title>
          </path>
        );
      })}
    </svg>
  );
}

function arcPath(cx: number, cy: number, r: number, ri: number, a1: number, a2: number): string {
  const largeArc = a2 - a1 > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  if (ri === 0) {
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }
  const xi1 = cx + ri * Math.cos(a1);
  const yi1 = cy + ri * Math.sin(a1);
  const xi2 = cx + ri * Math.cos(a2);
  const yi2 = cy + ri * Math.sin(a2);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ri} ${ri} 0 ${largeArc} 0 ${xi1} ${yi1} Z`;
}

// ── Vertical bars (used for Tenant — many labels, slanted ticks) ──────

function VerticalBars({ rows, cap = 40 }: { rows: { label: string; n: number }[]; cap?: number }) {
  const display = rows.slice(0, cap);
  const overflow = rows.length > display.length ? rows.length - display.length : 0;
  if (!display.length || display.every((r) => r.n === 0)) {
    return <div className="muted small">No data in this window.</div>;
  }
  const max = display.reduce((m, r) => Math.max(m, r.n), 0);

  // Choose a nice Y-axis ceiling — round up to a "nice" tick value.
  const yMax = niceCeil(max);
  const yTicks = 4;

  const barW = 18;
  const gap = 8;
  const padLeft = 40;
  const padRight = 12;
  const chartW = display.length * (barW + gap);
  const chartH = 200;
  const labelH = 90; // slanted labels below

  const innerW = chartW;
  const totalW = padLeft + innerW + padRight;
  const totalH = chartH + labelH + 14;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={totalW}
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: "block", minWidth: "100%" }}
      >
        {/* Y axis gridlines + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = (yMax / yTicks) * i;
          const y = chartH - (v / yMax) * chartH + 4;
          return (
            <g key={i}>
              <line x1={padLeft} x2={padLeft + innerW} y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--muted)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {display.map((r, i) => {
          const h = (r.n / yMax) * chartH;
          const x = padLeft + i * (barW + gap);
          const y = chartH - h + 4;
          return (
            <g key={r.label}>
              <rect
                x={x} y={y}
                width={barW} height={h}
                fill={PALETTE[i % PALETTE.length]}
                rx={2}
              >
                <title>{`${r.label}: ${r.n}`}</title>
              </rect>
              {/* Slanted label */}
              <text
                x={x + barW / 2}
                y={chartH + 16}
                fontSize={11}
                fill="var(--muted)"
                textAnchor="end"
                transform={`rotate(-50 ${x + barW / 2} ${chartH + 16})`}
              >
                {r.label.length > 22 ? r.label.slice(0, 20) + "…" : r.label}
              </text>
            </g>
          );
        })}
      </svg>
      {overflow > 0 && (
        <div className="muted small" style={{ marginTop: 6 }}>
          +{overflow} more tenant{overflow === 1 ? "" : "s"} not shown.
        </div>
      )}
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(n)));
  const k = n / exp;
  let nice;
  if (k <= 1) nice = 1;
  else if (k <= 2) nice = 2;
  else if (k <= 5) nice = 5;
  else nice = 10;
  return nice * exp;
}
