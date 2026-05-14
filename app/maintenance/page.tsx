"use client";

import { useEffect, useMemo, useState } from "react";
import type { MaintenanceRequest } from "../api/maintenance/requests/route";

const STATUS_OPTIONS = ["New", "In Progress", "Complete"] as const;
const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
type StatusFilter = "Open" | "All" | (typeof STATUS_OPTIONS)[number];

function formatDate(d: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Math.floor((Date.now() - t) / 86400000);
}

function statusStyle(s: string): { bg: string; fg: string; border: string } {
  switch (s) {
    case "New":         return { bg: "rgba(11,74,125,0.10)",  fg: "#0b4a7d", border: "rgba(11,74,125,0.30)" };
    case "In Progress": return { bg: "rgba(217,119,6,0.10)",  fg: "#b45309", border: "rgba(217,119,6,0.30)" };
    case "Complete":    return { bg: "rgba(22,163,74,0.10)",  fg: "#15803d", border: "rgba(22,163,74,0.30)" };
    default:            return { bg: "rgba(15,23,42,0.06)",   fg: "#475569", border: "rgba(15,23,42,0.15)" };
  }
}

function priorityStyle(p: string): { bg: string; fg: string; border: string } {
  switch (p) {
    case "High":   return { bg: "rgba(220,38,38,0.10)", fg: "#b91c1c", border: "rgba(220,38,38,0.30)" };
    case "Medium": return { bg: "rgba(217,119,6,0.10)", fg: "#b45309", border: "rgba(217,119,6,0.30)" };
    case "Low":    return { bg: "rgba(15,23,42,0.06)",  fg: "#475569", border: "rgba(15,23,42,0.15)" };
    default:       return { bg: "rgba(15,23,42,0.06)",  fg: "#475569", border: "rgba(15,23,42,0.15)" };
  }
}

export default function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);
  const [error, setError] = useState<{ message: string; configError?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("Open");
  const [priority, setPriority] = useState<"All" | (typeof PRIORITY_OPTIONS)[number]>("All");
  const [property, setProperty] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MaintenanceRequest | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/maintenance/requests")
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) {
          setError({ message: body.error ?? "Failed to load", configError: body.configError });
          setRequests([]);
        } else {
          setRequests(body.requests ?? []);
        }
      })
      .catch((e) => alive && setError({ message: e?.message ?? "Network error" }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const properties = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests ?? []) for (const p of r.propertyNames) set.add(p);
    return ["All", ...Array.from(set).sort()];
  }, [requests]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (status === "Open" && r.status === "Complete") return false;
      if (status !== "Open" && status !== "All" && r.status !== status) return false;
      if (priority !== "All" && r.priority !== priority) return false;
      if (property !== "All" && !r.propertyNames.includes(property)) return false;
      if (q) {
        const hay = [
          r.subject,
          r.aiSummary,
          r.internalNotes,
          ...r.propertyNames,
          ...r.contactNames,
          ...r.categories,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, status, priority, property, search]);

  const counts = useMemo(() => {
    const all = requests ?? [];
    return {
      total: all.length,
      open: all.filter((r) => r.status !== "Complete").length,
      newCount: all.filter((r) => r.status === "New").length,
      inProgress: all.filter((r) => r.status === "In Progress").length,
      complete: all.filter((r) => r.status === "Complete").length,
      highOpen: all.filter((r) => r.status !== "Complete" && r.priority === "High").length,
    };
  }, [requests]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Maintenance</h1>
        <a
          href="https://airtable.com/appu2QwzsaWb4Qw2X/pageF2MN3KyaNqj0D?MJMG1=allRecords&92GWJ=allRecords"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: "#0b4a7d", textDecoration: "none", fontWeight: 600 }}
        >
          Open Airtable →
        </a>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>
            {error.configError ? "Airtable not configured" : "Couldn't load Airtable"}
          </div>
          <div className="muted small">
            {error.configError
              ? "Set the AIRTABLE_TOKEN env var to a Personal Access Token with read access to base appu2QwzsaWb4Qw2X."
              : error.message}
          </div>
        </div>
      )}

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Tile label="Open" value={counts.open} accent="#0b4a7d" />
        <Tile label="High Priority Open" value={counts.highOpen} accent="#b91c1c" />
        <Tile label="New" value={counts.newCount} accent="#0b4a7d" />
        <Tile label="In Progress" value={counts.inProgress} accent="#b45309" />
        <Tile label="Complete" value={counts.complete} accent="#15803d" />
      </div>

      {/* Filters */}
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} style={selectStyle}>
            <option value="Open">Open (New + In Progress)</option>
            <option value="All">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={selectStyle}>
            <option value="All">All</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Property">
          <select value={property} onChange={(e) => setProperty(e.target.value)} style={selectStyle}>
            {properties.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Search">
          <input
            type="search"
            placeholder="Subject, summary, tenant, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...selectStyle, minWidth: 240 }}
          />
        </Field>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          {loading ? "Loading…" : `${filtered.length} of ${counts.total}`}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Property</th>
                <th>Tenant</th>
                <th>Category</th>
                <th>Submitted</th>
                <th style={{ textAlign: "right" }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>No requests match.</td></tr>
              )}
              {filtered.map((r) => {
                const sStyle = statusStyle(r.status);
                const pStyle = priorityStyle(r.priority);
                const age = daysSince(r.submittedDate);
                return (
                  <tr
                    key={r.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(r)}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {r.subject}
                      {r.attachmentCount > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>📎 {r.attachmentCount}</span>
                      )}
                    </td>
                    <td><Pill style={sStyle}>{r.status || "—"}</Pill></td>
                    <td>{r.priority ? <Pill style={pStyle}>{r.priority}</Pill> : <span className="muted small">—</span>}</td>
                    <td style={{ fontSize: 13 }}>{r.propertyNames.join(", ") || <span className="muted small">—</span>}</td>
                    <td style={{ fontSize: 13 }}>{r.contactNames.join(", ") || <span className="muted small">—</span>}</td>
                    <td style={{ fontSize: 12 }}>{r.categories.join(", ") || <span className="muted small">—</span>}</td>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatDate(r.submittedDate)}</td>
                    <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                      {r.status === "Complete" ? (
                        <span className="muted">done</span>
                      ) : age == null ? (
                        "—"
                      ) : (
                        <span style={{ color: age > 30 ? "#b91c1c" : age > 14 ? "#b45309" : "var(--text)" }}>
                          {age}d
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <RequestModal request={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Pill({ children, style }: { children: React.ReactNode; style: { bg: string; fg: string; border: string } }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      background: style.bg, color: style.fg, border: `1px solid ${style.border}`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function RequestModal({ request, onClose }: { request: MaintenanceRequest; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sStyle = statusStyle(request.status);
  const pStyle = priorityStyle(request.priority);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "60px 16px 16px", zIndex: 100, overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", color: "var(--text)",
          borderRadius: 12, border: "1px solid var(--border)",
          maxWidth: 720, width: "100%", padding: 24,
          boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{request.subject}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              fontSize: 16, lineHeight: 1, color: "var(--muted)",
            }}
          >×</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill style={sStyle}>{request.status || "—"}</Pill>
          {request.priority && <Pill style={pStyle}>{request.priority}</Pill>}
          {request.categories.map((c) => (
            <Pill key={c} style={{ bg: "rgba(15,23,42,0.05)", fg: "#475569", border: "rgba(15,23,42,0.15)" }}>{c}</Pill>
          ))}
        </div>

        <Row label="Property" value={request.propertyNames.join(", ")} />
        <Row label="Tenant" value={request.contactNames.join(", ")} />
        <Row label="Submitted" value={formatDate(request.submittedDate)} />
        {request.status === "Complete" && (
          <Row label="Completed" value={formatDate(request.completedDate)} />
        )}

        {request.aiSummary && (
          <Section title="AI Summary">
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{request.aiSummary}</div>
          </Section>
        )}

        {request.internalNotes && (
          <Section title="Internal Notes">
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {request.internalNotes}
            </div>
          </Section>
        )}

        {request.attachmentCount > 0 && (
          <Section title="Attachments">
            <div className="muted small">
              {request.attachmentCount} attachment{request.attachmentCount === 1 ? "" : "s"} — open in Airtable to view.
            </div>
          </Section>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <a
            href={`https://airtable.com/${"appu2QwzsaWb4Qw2X"}/${"tblXlp2JXxyN6f4Qf"}/${request.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#0b4a7d", textDecoration: "none", fontWeight: 600 }}
          >
            Open in Airtable →
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
      <span style={{ width: 110, flexShrink: 0, color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
