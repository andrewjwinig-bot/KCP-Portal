"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  REQUEST_CATEGORIES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type MaintenanceRequest,
  type RequestCategory,
  type RequestPriority,
  type RequestStatus,
} from "@/lib/maintenance/requests";
import { STAFF, type StaffId } from "@/lib/maintenance/staff";
import { summarize } from "@/lib/maintenance/summarize";

type Tab = "active" | "completed";

function formatDate(d: string | null): string {
  if (!d) return "—";
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return d;
  const dt = new Date(t);
  return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}/${String(dt.getFullYear()).slice(2)}`;
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return null;
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

/**
 * Short keyword-style summary for the row. Submissions through /submit save
 * the tenant's actual description as the first "Tenant Submission" note —
 * summarized via lib/maintenance/summarize that reads better than either the
 * raw paragraph or the auto-generated subject. Airtable-backfilled records
 * fall through to the subject (Airtable's "Request Subject" is usually
 * already a decent summary).
 */
function briefDescription(r: MaintenanceRequest): string {
  const intake = r.notes.find(
    (n) => n.authorName === "Tenant Submission" || n.authorName === "Migrated",
  );
  if (intake) {
    const summary = summarize(intake.text);
    if (summary) return summary;
  }
  return r.subject;
}

/**
 * Tenant = leased company (rent-roll occupant). New records save it on the
 * tenantCompany field directly; older records (backfilled from Airtable or
 * created before this split) baked it into propertyName as "<Property> — <Company>".
 * Parse that out for back-compat.
 */
function companyOf(r: MaintenanceRequest): string {
  if (r.tenantCompany) return r.tenantCompany;
  const m = r.propertyName.match(/^(.+?)\s*—\s*(.+)$/);
  return m ? m[2].trim() : "";
}

/** Property name with any back-compat "— Company" suffix stripped off. */
function propertyOf(r: MaintenanceRequest): string {
  if (r.tenantCompany) return r.propertyName;
  const m = r.propertyName.match(/^(.+?)\s*—\s*(.+)$/);
  return m ? m[1].trim() : r.propertyName;
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
  const [tab, setTab] = useState<Tab>("active");
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState<"All" | RequestPriority>("All");
  const [assignee, setAssignee] = useState<"All" | "Unassigned" | StaffId>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "New" | "In Progress">("All");
  const [property, setProperty] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MaintenanceRequest | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/maintenance/requests");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setRequests(body.requests ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const properties = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests ?? []) {
      const p = propertyOf(r);
      if (p) set.add(p);
    }
    return ["All", ...Array.from(set).sort()];
  }, [requests]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab === "active"    && r.status === "Complete") return false;
      if (tab === "completed" && r.status !== "Complete") return false;
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (priority !== "All" && r.priority !== priority) return false;
      if (assignee === "Unassigned" && r.assignedTo !== null) return false;
      if (assignee !== "All" && assignee !== "Unassigned" && r.assignedTo !== assignee) return false;
      if (property !== "All" && propertyOf(r) !== property) return false;
      if (q) {
        const hay = [
          r.id, r.subject, r.tenantName, r.tenantEmail, companyOf(r),
          propertyOf(r), ...r.categories, ...r.notes.map((n) => n.text),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, tab, priority, assignee, property, search, statusFilter]);

  const counts = useMemo(() => {
    const all = requests ?? [];
    return {
      active: all.filter((r) => r.status !== "Complete").length,
      completed: all.filter((r) => r.status === "Complete").length,
      newCount: all.filter((r) => r.status === "New").length,
      inProgress: all.filter((r) => r.status === "In Progress").length,
      highOpen: all.filter((r) => r.status !== "Complete" && r.priority === "High").length,
      unassigned: all.filter((r) => r.status !== "Complete" && r.assignedTo === null).length,
    };
  }, [requests]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Maintenance Requests</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={reload}
            disabled={loading}
            className="btn"
            style={{ fontSize: 13, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Pull the latest requests"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{
                animation: loading ? "spin 0.8s linear infinite" : "none",
                transformOrigin: "center",
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <a
            href="/submit"
            target="_blank"
            rel="noopener noreferrer"
            className="btn primary"
            style={{ fontSize: 13, padding: "6px 12px", textDecoration: "none" }}
            title="Open the public tenant submission form in a new tab"
          >
            Preview tenant form →
          </a>
        </div>
      </header>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active <Badge>{counts.active}</Badge>
        </TabButton>
        <TabButton active={tab === "completed"} onClick={() => setTab("completed")}>
          Completed <Badge muted>{counts.completed}</Badge>
        </TabButton>
      </div>

      {(tab === "active" || tab === "completed") && (
      <>
        {error && (
          <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
            <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Couldn't load requests</div>
            <div className="muted small">{error}</div>
          </div>
        )}

        {tab === "active" && (() => {
          const noExtraFilters =
            priority === "All" && assignee === "All" && statusFilter === "All";
          function clearAll() {
            setPriority("All");
            setAssignee("All");
            setStatusFilter("All");
          }
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <FilterTile
                label="Active"
                value={counts.active}
                accent="#0b4a7d"
                active={noExtraFilters}
                onClick={clearAll}
              />
              <FilterTile
                label="High Priority"
                value={counts.highOpen}
                accent="#b91c1c"
                active={priority === "High"}
                onClick={() => setPriority(priority === "High" ? "All" : "High")}
              />
              <FilterTile
                label="Unassigned"
                value={counts.unassigned}
                accent="#b45309"
                active={assignee === "Unassigned"}
                onClick={() => setAssignee(assignee === "Unassigned" ? "All" : "Unassigned")}
              />
              <FilterTile
                label="New"
                value={counts.newCount}
                accent="#0b4a7d"
                active={statusFilter === "New"}
                onClick={() => setStatusFilter(statusFilter === "New" ? "All" : "New")}
              />
              <FilterTile
                label="In Progress"
                value={counts.inProgress}
                accent="#b45309"
                active={statusFilter === "In Progress"}
                onClick={() => setStatusFilter(statusFilter === "In Progress" ? "All" : "In Progress")}
              />
            </div>
          );
        })()}

        {/* Filters — inline strip, no card chrome. */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "0 2px" }}>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={selectStyle}>
              <option value="All">All</option>
              {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Assignee">
            <select value={assignee} onChange={(e) => setAssignee(e.target.value as typeof assignee)} style={selectStyle}>
              <option value="All">All</option>
              <option value="Unassigned">Unassigned</option>
              {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
              placeholder="Description, tenant, ref ID, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...selectStyle, minWidth: 240 }}
            />
          </Field>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", paddingBottom: 6 }}>
            {loading ? "Loading…" : `${filtered.length} of ${(requests ?? []).length}`}
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>{tab === "active" ? "Age" : "Completed"}</th>
                  <th>Property</th>
                  <th>Tenant</th>
                  <th>Contact</th>
                  <th>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>
                    No requests. {tab === "active" && (requests?.length ?? 0) === 0 && "Tenants can submit via the public form at /submit."}
                  </td></tr>
                )}
                {filtered.map((r) => {
                  const pStyle = priorityStyle(r.priority);
                  const sStyle = statusStyle(r.status);
                  const age = daysSince(r.submittedDate);
                  return (
                    <tr
                      key={r.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelected(r)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                    >
                      <td style={{ fontWeight: 600, maxWidth: 340 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {briefDescription(r)}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                          {tab === "active" && r.status !== "New" && (
                            <Pill style={sStyle}>{r.status}</Pill>
                          )}
                          {r.attachments.length > 0 && (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>📎 {r.attachments.length}</span>
                          )}
                        </div>
                      </td>
                      <td>{r.priority ? <Pill style={pStyle}>{r.priority}</Pill> : <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 12 }}>{r.categories.join(", ") || <span className="muted small">—</span>}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {tab === "completed"
                          ? <span style={{ fontWeight: 500, color: "var(--muted)" }}>{formatDate(r.completedDate)}</span>
                          : age == null ? "—" : (
                              <span style={{ color: age > 30 ? "#b91c1c" : age > 14 ? "#b45309" : "var(--text)" }}>
                                {age}d
                              </span>
                            )}
                      </td>
                      <td style={{ fontSize: 13 }}>{propertyOf(r) || <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 13 }}>{companyOf(r) || <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 13 }}>
                        {r.tenantName || r.tenantEmail ? (
                          <>
                            <div>{r.tenantName || r.tenantEmail}</div>
                            {r.tenantName && r.tenantEmail && (
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.tenantEmail}</div>
                            )}
                          </>
                        ) : <span className="muted small">—</span>}
                      </td>
                      <td
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 13, fontWeight: 600 }}
                      >
                        <RowAssigneeSelect
                          request={r}
                          onUpdated={(updated) => {
                            setRequests((prev) => prev?.map((x) => x.id === updated.id ? updated : x) ?? prev);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <RequestModal
            request={selected}
            onClose={() => setSelected(null)}
            onChange={(updated) => {
              setRequests((prev) => prev?.map((r) => r.id === updated.id ? updated : r) ?? prev);
              setSelected(updated);
            }}
            onDelete={(id) => {
              setRequests((prev) => prev?.filter((r) => r.id !== id) ?? prev);
              setSelected(null);
            }}
          />
        )}
      </>
      )}
    </main>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

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

/**
 * Clickable summary pill, styled to match the rent-roll StatPill (big number
 * on top, small label below) instead of the previous card-with-label-on-top
 * Tile. Active state shows the accent color as both border and tint.
 */
function FilterTile({
  label, value, accent, active, onClick,
}: {
  label: string;
  value: number;
  accent: string;
  active: boolean;
  onClick: () => void;
}) {
  // hex → rgba(…, 0.10) for the active background tint
  function tint(hex: string, a: number): string {
    const m = /^#?([a-f0-9]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: active ? `1.5px solid ${accent}` : "1.5px solid var(--border)",
        borderRadius: 10,
        padding: "13px 16px 11px",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
        background: active ? tint(accent, 0.08) : "var(--card)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.12s, border-color 0.12s",
        textAlign: "center",
        width: "100%",
        minWidth: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <b style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: accent }}>{value}</b>
      <span style={{
        fontSize: 11, fontWeight: 600, color: "var(--muted)",
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {label}
      </span>
    </button>
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

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{
      marginLeft: 6, padding: "1px 7px", borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      background: muted ? "rgba(15,23,42,0.06)" : "rgba(11,74,125,0.10)",
      color: muted ? "var(--muted)" : "#0b4a7d",
    }}>
      {children}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid #0b4a7d" : "2px solid transparent",
        color: active ? "var(--text)" : "var(--muted)",
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

// Backfill UI was removed; the /api/maintenance/backfill endpoint stays
// in place (reachable via authenticated curl) for any rainy-day one-shot
// import if Airtable still has stragglers.

function RequestModal({
  request, onClose, onChange, onDelete,
}: {
  request: MaintenanceRequest;
  onClose: () => void;
  onChange: (r: MaintenanceRequest) => void;
  onDelete: (id: string) => void;
}) {
  const [draftNote, setDraftNote] = useState("");
  const [noteAuthor, setNoteAuthor] = useState<StaffId>("greg");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/maintenance/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      onChange(j.request);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!draftNote.trim()) return;
    await patch({ addNote: { author: noteAuthor, text: draftNote } });
    setDraftNote("");
  }

  async function remove() {
    if (!confirm("Delete this request? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/maintenance/requests/${request.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(request.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const sStyle = statusStyle(request.status);
  const pStyle = priorityStyle(request.priority);

  const assigneeName = request.assignedTo
    ? STAFF.find((s) => s.id === request.assignedTo)?.name ?? request.assignedTo
    : null;

  // Header right-side timestamp: completed date when finished, age otherwise.
  const ageDays = daysSince(request.submittedDate);
  const submittedLabel =
    request.status === "Complete"
      ? `Completed ${formatDate(request.completedDate)}`
      : ageDays == null
        ? `Submitted ${formatDate(request.submittedDate)}`
        : ageDays === 0
          ? "Submitted today"
          : ageDays === 1
            ? "Submitted 1 day ago"
            : `Submitted ${ageDays} days ago`;

  // Split notes into the tenant's intake (Submission section) vs everything
  // staff added after the fact (Internal Notes section + add-note composer).
  const submissionNote = request.notes.find(
    (n) => n.authorName === "Tenant Submission" || n.authorName === "Migrated",
  );
  const internalNotes = request.notes.filter((n) => n !== submissionNote);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "48px 16px 32px", zIndex: 100, overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", color: "var(--text)",
          borderRadius: 14, border: "1px solid var(--border)",
          maxWidth: 960, width: "100%",
          boxShadow: "0 24px 60px rgba(15,23,42,0.32)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {request.subject}
              </h2>
              <div className="muted small" style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }}>
                {request.id}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent", border: "1px solid var(--border)",
                borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                fontSize: 18, lineHeight: 1, color: "var(--muted)",
                flexShrink: 0,
              }}
            >×</button>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flex: 1, minWidth: 0 }}>
              <Pill style={sStyle}>{request.status}</Pill>
              {request.priority && <Pill style={pStyle}>{request.priority}</Pill>}
              {assigneeName && (
                <Pill style={{ bg: "rgba(11,74,125,0.10)", fg: "#0b4a7d", border: "rgba(11,74,125,0.30)" }}>
                  {assigneeName}
                </Pill>
              )}
              {request.categories.map((c) => (
                <Pill key={c} style={{ bg: "rgba(15,23,42,0.05)", fg: "#475569", border: "rgba(15,23,42,0.15)" }}>{c}</Pill>
              ))}
            </div>
            <span style={{
              fontSize: 12, color: "var(--muted)", fontWeight: 600,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {submittedLabel}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Meta strip — Property / Tenant / Contact */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            padding: "16px 18px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "rgba(15,23,42,0.025)",
          }}>
            <MetaCell label="Property" value={propertyOf(request)} />
            <MetaCell label="Tenant" value={companyOf(request)} />
            <MetaCell
              label="Contact"
              value={request.tenantName || request.tenantEmail || ""}
              sub={request.tenantName && request.tenantEmail ? request.tenantEmail : undefined}
            />
          </div>

          {/* Action row: status / priority / assignee */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <Field label="Status">
              <select disabled={busy} value={request.status} onChange={(e) => patch({ status: e.target.value as RequestStatus })} style={selectStyle}>
                {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select disabled={busy} value={request.priority} onChange={(e) => patch({ priority: e.target.value as RequestPriority | "" })} style={selectStyle}>
                <option value="">—</option>
                {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Assigned To">
              <select
                disabled={busy}
                value={request.assignedTo ?? ""}
                onChange={(e) => patch({ assignedTo: e.target.value === "" ? null : (e.target.value as StaffId) })}
                style={selectStyle}
              >
                <option value="">— Unassigned —</option>
                {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          {/* Categories */}
          <Section title="Categories">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REQUEST_CATEGORIES.map((c) => {
                const on = request.categories.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => patch({ categories: on ? request.categories.filter((x) => x !== c) : [...request.categories, c as RequestCategory] })}
                    disabled={busy}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999,
                      border: on ? "1px solid rgba(11,74,125,0.55)" : "1px solid var(--border)",
                      background: on ? "rgba(11,74,125,0.10)" : "var(--card)",
                      color: on ? "#0b4a7d" : "var(--muted)",
                      cursor: busy ? "default" : "pointer",
                      fontFamily: "inherit",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Submission — the tenant's original intake note (read-only) */}
          <Section title="Submission">
            {submissionNote ? (
              <div style={{
                padding: "12px 14px",
                border: "1px solid var(--border)", borderRadius: 10,
                background: "rgba(15,23,42,0.025)",
              }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.02em" }}>
                  {submissionNote.authorName} · {new Date(submissionNote.createdAt).toLocaleString()}
                </div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{submissionNote.text}</div>
              </div>
            ) : (
              <div className="muted small">No tenant submission recorded for this request.</div>
            )}
          </Section>

          {/* Internal Notes — staff-added notes + the add-note composer */}
          <Section title={`Internal Notes (${internalNotes.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {internalNotes.length === 0 && (
                <div className="muted small" style={{ padding: "8px 0" }}>No internal notes yet.</div>
              )}
              {internalNotes.map((n) => (
                <div key={n.id} style={{
                  padding: "12px 14px",
                  border: "1px solid var(--border)", borderRadius: 10,
                  background: "rgba(15,23,42,0.025)",
                }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.02em" }}>
                    {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.text}</div>
                </div>
              ))}

              {/* Add-note composer */}
              <div style={{
                marginTop: 6,
                padding: 14,
                border: "1px solid var(--border)", borderRadius: 10,
                background: "var(--card)",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                    Author
                  </span>
                  <select
                    value={noteAuthor}
                    onChange={(e) => setNoteAuthor(e.target.value as StaffId)}
                    style={{ ...selectStyle, width: "auto", minWidth: 120 }}
                  >
                    {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <textarea
                  placeholder="Add an internal note…"
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={3}
                  style={{ ...selectStyle, width: "100%", minHeight: 64, fontFamily: "inherit", resize: "vertical", fontSize: 14 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={addNote}
                    disabled={busy || !draftNote.trim()}
                    className="btn primary"
                    style={{ fontSize: 13, padding: "9px 18px" }}
                  >
                    Add note
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* Attachments — last */}
          <AttachmentsSection
            request={request}
            busy={busy}
            setBusy={setBusy}
            onUpdated={onChange}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 32px 20px",
          borderTop: "1px solid var(--border)",
          background: "rgba(15,23,42,0.02)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <button
            onClick={remove}
            disabled={busy}
            style={{
              fontSize: 12, fontWeight: 600, color: "#b91c1c", background: "transparent",
              border: "1px solid rgba(220,38,38,0.35)", borderRadius: 8,
              padding: "8px 14px", cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Delete Request
          </button>
          {request.status !== "Complete" ? (
            <button
              onClick={() => patch({ status: "Complete" })}
              disabled={busy}
              className="btn primary"
              style={{ fontSize: 14, padding: "10px 22px", fontWeight: 700 }}
            >
              ✓ Mark Complete
            </button>
          ) : (
            <button
              onClick={() => patch({ status: "In Progress" })}
              disabled={busy}
              className="btn"
              style={{ fontSize: 14, padding: "10px 22px", fontWeight: 700 }}
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RowAssigneeSelect({
  request, onUpdated,
}: {
  request: MaintenanceRequest;
  onUpdated: (r: MaintenanceRequest) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setTo(value: StaffId | null) {
    if (busy || value === request.assignedTo) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/maintenance/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      onUpdated(j.request);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={request.assignedTo ?? ""}
      disabled={busy}
      onChange={(e) => setTo(e.target.value === "" ? null : (e.target.value as StaffId))}
      onClick={(e) => e.stopPropagation()}
      style={{
        ...selectStyle,
        padding: "5px 8px",
        fontSize: 12,
        fontWeight: 600,
        minWidth: 110,
        background: request.assignedTo ? "rgba(11,74,125,0.06)" : "var(--card)",
        color: request.assignedTo ? "var(--text)" : "var(--muted)",
      }}
    >
      <option value="">— Unassigned —</option>
      {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

function MetaCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, wordBreak: "break-word" }}>
        {value || "—"}
      </span>
      {sub && (
        <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.3, wordBreak: "break-word" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function AttachmentsSection({
  request, busy, setBusy, onUpdated,
}: {
  request: MaintenanceRequest;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onUpdated: (r: MaintenanceRequest) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/maintenance/requests/${request.id}/attachments`, {
        method: "POST",
        body: form,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      onUpdated(j.request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(attachmentId: string) {
    if (!confirm("Delete this attachment?")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/maintenance/requests/${request.id}/attachments/${attachmentId}`,
        { method: "DELETE" },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Delete failed");
      onUpdated(j.request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={`Attachments (${request.attachments.length})`}>
      {error && (
        <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{error}</div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 8, marginBottom: 8,
      }}>
        {request.attachments.map((a) => {
          const isImage = a.contentType.startsWith("image/");
          return (
            <div
              key={a.id}
              style={{
                position: "relative",
                border: "1px solid var(--border)", borderRadius: 8,
                background: "rgba(15,23,42,0.02)",
                overflow: "hidden",
                display: "flex", flexDirection: "column",
              }}
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={a.url}
                    alt={a.name}
                    style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
                  />
                </a>
              ) : (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    height: 100, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, textDecoration: "none", color: "var(--muted)",
                  }}
                >
                  📄
                </a>
              )}
              <div style={{ padding: "6px 8px", fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={a.name}
                  style={{
                    fontWeight: 600, color: "var(--text)", textDecoration: "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {a.name}
                </a>
                <div style={{ color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                  <span>{a.size ? `${Math.round(a.size / 1024)} KB` : ""}</span>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={busy}
                    title="Delete attachment"
                    style={{
                      background: "transparent", border: "none", color: "#b91c1c",
                      cursor: busy ? "default" : "pointer", padding: 0, fontSize: 11, fontWeight: 600,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <label
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "7px 12px", borderRadius: 6,
          border: "1px dashed var(--border)",
          fontSize: 13, fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          color: "var(--muted)",
          background: "var(--card)",
        }}
      >
        + Add file
        <input
          type="file"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              upload(f);
              e.currentTarget.value = "";
            }
          }}
          style={{ display: "none" }}
        />
      </label>
      <span className="muted small" style={{ marginLeft: 10 }}>
        Images, PDFs, docs up to ~4 MB.
      </span>
    </Section>
  );
}

