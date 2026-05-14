"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type MaintenanceRequest,
} from "@/lib/maintenance/requests";
import { STAFF } from "@/lib/maintenance/staff";
import { StatPill } from "@/app/components/Pill";

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

      {/* KPI tiles — canonical StatPill (matches rent-roll summary) */}
      <div className="pills">
        <StatPill label="Active"             value={kpis.activeCount}     accent={ACCENT_BLUE} />
        <StatPill label="High Priority Open" value={kpis.highOpen}        accent={ACCENT_RED} />
        <StatPill label="Avg Days Open"      value={fmtDays(kpis.avgOpen)}  accent={ACCENT_AMBER} />
        <StatPill label="Avg Days to Close"  value={fmtDays(kpis.avgClose)} accent={ACCENT_GREEN} />
      </div>

      {/* Open by Priority */}
      <div className="card">
        <div style={sectionLabelStyle}>Open by Priority</div>
        <div className="pills" style={{ marginTop: 10 }}>
          <StatPill label="High"            value={kpis.highOpen} accent={ACCENT_RED} />
          <StatPill label="Medium"          value={kpis.medOpen}  accent={ACCENT_AMBER} />
          <StatPill label="Low"             value={kpis.lowOpen}  accent="#475569" />
          <StatPill label="No Priority Set" value={kpis.unset} />
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
  const total = rows.reduce((s, r) => s + r.n, 0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  if (!rows.length || rows.every((r) => r.n === 0)) {
    return <div className="muted small">No data in this window.</div>;
  }
  function onMove(e: React.MouseEvent, label: string, n: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ label, n, pct: total > 0 ? n / total : undefined, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }} onMouseLeave={() => setHover(null)}>
      {rows.map((r) => {
        const pct = max === 0 ? 0 : (r.n / max) * 100;
        return (
          <div
            key={r.label}
            onMouseMove={(e) => onMove(e, r.label, r.n)}
            style={{ cursor: "pointer" }}
          >
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
      {hover && <ChartTooltip hover={hover} />}
    </div>
  );
}

// ── Pie / Donut with side legend ──────────────────────────────────────

type HoverState = { label: string; n: number; pct?: number; x: number; y: number };

function ChartTooltip({ hover }: { hover: HoverState }) {
  return (
    <div
      style={{
        position: "absolute",
        left: hover.x + 12,
        top: hover.y + 12,
        background: "rgba(15,23,42,0.92)",
        color: "#fff",
        padding: "6px 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(15,23,42,0.20)",
        zIndex: 30,
      }}
    >
      <div>{hover.label}</div>
      <div style={{ fontWeight: 500, opacity: 0.9, marginTop: 2 }}>
        {hover.n}{hover.pct != null ? ` · ${(hover.pct * 100).toFixed(1)}%` : ""}
      </div>
    </div>
  );
}

function PieWithLegend({ rows, donut }: { rows: { label: string; n: number }[]; donut: boolean }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  if (!total) return <div className="muted small">No data in this window.</div>;
  const size = 220;
  function onSliceMove(e: React.MouseEvent, label: string, n: number, pct: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ label, n, pct, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
  return (
    <div ref={wrapRef} style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
      <div style={{ flexShrink: 0 }}>
        <PieSvg
          rows={rows}
          total={total}
          size={size}
          donut={donut}
          onSliceMove={onSliceMove}
          onSliceLeave={() => setHover(null)}
        />
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
      {hover && <ChartTooltip hover={hover} />}
    </div>
  );
}

function PieSvg({
  rows, total, size, donut, onSliceMove, onSliceLeave,
}: {
  rows: { label: string; n: number }[];
  total: number;
  size: number;
  donut: boolean;
  onSliceMove: (e: React.MouseEvent, label: string, n: number, pct: number) => void;
  onSliceLeave: () => void;
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
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onMouseLeave={onSliceLeave}>
        <circle
          cx={cx} cy={cy} r={r} fill={color}
          onMouseMove={(e) => onSliceMove(e, row.label, row.n, 1)}
          style={{ cursor: "pointer" }}
        />
        {donut && <circle cx={cx} cy={cy} r={ri} fill="var(--card)" pointerEvents="none" />}
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onMouseLeave={onSliceLeave}>
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
            onMouseMove={(e) => onSliceMove(e, row.label, row.n, pct)}
            style={{ cursor: "pointer" }}
          />
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
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  if (!display.length || display.every((r) => r.n === 0)) {
    return <div className="muted small">No data in this window.</div>;
  }
  const max = display.reduce((m, r) => Math.max(m, r.n), 0);
  const totalCount = display.reduce((s, r) => s + r.n, 0);

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

  function onBarMove(e: React.MouseEvent, label: string, n: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ label, n, pct: totalCount > 0 ? n / totalCount : undefined, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div ref={wrapRef} style={{ overflowX: "auto", position: "relative" }}>
      <svg
        width={totalW}
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: "block", minWidth: "100%" }}
        onMouseLeave={() => setHover(null)}
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
                onMouseMove={(e) => onBarMove(e, r.label, r.n)}
                style={{ cursor: "pointer" }}
              />
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
      {hover && <ChartTooltip hover={hover} />}
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
