"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type MaintenanceRequest,
  type RequestCategory,
  type RequestPriority,
} from "@/lib/maintenance/requests";
import { STAFF } from "@/lib/maintenance/staff";

// Standalone Maintenance Reports page. Linked from the Sidebar as a
// sub-item under Maintenance. The previous in-page Reports tab has been
// removed in favour of this fuller analytics view.

type Window = "7" | "30" | "90" | "all";
type Scope = "active" | "all";

const ACCENT_BLUE   = "#0b4a7d";
const ACCENT_GREEN  = "#15803d";
const ACCENT_PURPLE = "#7c3aed";
const ACCENT_AMBER  = "#b45309";
const ACCENT_RED    = "#b91c1c";

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
  const byProperty = useMemo(() => countBy(filtered, (r) => r.propertyName || "(none)"), [filtered]);
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
  const byPriority = useMemo(() => countBy(filtered, (r) => r.priority || "(none)"), [filtered]);
  const byTenant = useMemo(
    () => countBy(filtered, (r) => r.tenantName || r.tenantEmail || "(unknown)"),
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
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
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
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
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

      {/* Open by priority breakdown — separate row so it reads quickly */}
      <div className="card">
        <div style={sectionLabelStyle}>Open by Priority</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 10 }}>
          <PriorityCount label="High"     n={kpis.highOpen} color={ACCENT_RED} />
          <PriorityCount label="Medium"   n={kpis.medOpen}  color={ACCENT_AMBER} />
          <PriorityCount label="Low"      n={kpis.lowOpen}  color="#475569" />
          <PriorityCount label="No Priority Set" n={kpis.unset} color="#94a3b8" />
        </div>
      </div>

      {/* Aging — active requests broken into bands */}
      <div className="card">
        <div style={sectionLabelStyle}>Aging — Active Requests</div>
        <div style={{ marginTop: 10 }}>
          <Bars
            rows={aging.map((b) => ({ label: b.label, n: b.n }))}
            accent={ACCENT_AMBER}
          />
        </div>
      </div>

      {/* Chart grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14 }}>
        <ReportCard title="By Property" rows={byProperty} accent={ACCENT_BLUE} />
        <ReportCard title="By Category" rows={byCategory} accent={ACCENT_GREEN} />
        <ReportCard title="By Worker" rows={byWorker} accent={ACCENT_PURPLE} />
        <ReportCard title="By Priority" rows={byPriority} accent={ACCENT_AMBER} />
        <ReportCard title="By Tenant" rows={byTenant.slice(0, 15)} accent={ACCENT_BLUE} note={
          byTenant.length > 15 ? `+ ${byTenant.length - 15} more` : undefined
        } />
      </div>
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

function Bars({ rows, accent }: { rows: { label: string; n: number }[]; accent: string }) {
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

function ReportCard({
  title, rows, accent, note,
}: {
  title: string;
  rows: { label: string; n: number }[];
  accent: string;
  note?: string;
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={sectionLabelStyle}>{title}</div>
        {note && <span className="muted small">{note}</span>}
      </div>
      <Bars rows={rows} accent={accent} />
    </div>
  );
}
