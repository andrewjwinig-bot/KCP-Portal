"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaintenanceEmail } from "@/lib/maintenance/emails";
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

type Tab = "active" | "completed" | "inbox";

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
    for (const r of requests ?? []) if (r.propertyName) set.add(r.propertyName);
    return ["All", ...Array.from(set).sort()];
  }, [requests]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab === "active"    && r.status === "Complete") return false;
      if (tab === "completed" && r.status !== "Complete") return false;
      if (priority !== "All" && r.priority !== priority) return false;
      if (assignee === "Unassigned" && r.assignedTo !== null) return false;
      if (assignee !== "All" && assignee !== "Unassigned" && r.assignedTo !== assignee) return false;
      if (property !== "All" && r.propertyName !== property) return false;
      if (q) {
        const hay = [
          r.subject, r.aiSummary, r.tenantName, r.tenantEmail,
          r.propertyName, ...r.categories, ...r.notes.map((n) => n.text),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, tab, priority, assignee, property, search]);

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
        <h1>Maintenance</h1>
        <BackfillButton onDone={reload} />
      </header>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active <Badge>{counts.active}</Badge>
        </TabButton>
        <TabButton active={tab === "completed"} onClick={() => setTab("completed")}>
          Completed <Badge muted>{counts.completed}</Badge>
        </TabButton>
        <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")}>Inbox</TabButton>
      </div>

      {tab === "inbox" && <Inbox />}

      {tab !== "inbox" && (
      <>
        {error && (
          <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
            <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Couldn't load requests</div>
            <div className="muted small">{error}</div>
          </div>
        )}

        {tab === "active" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <Tile label="Active" value={counts.active} accent="#0b4a7d" />
            <Tile label="High Priority" value={counts.highOpen} accent="#b91c1c" />
            <Tile label="Unassigned" value={counts.unassigned} accent="#b45309" />
            <Tile label="New" value={counts.newCount} accent="#0b4a7d" />
            <Tile label="In Progress" value={counts.inProgress} accent="#b45309" />
          </div>
        )}

        <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
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
              placeholder="Subject, tenant, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...selectStyle, minWidth: 240 }}
            />
          </Field>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
            {loading ? "Loading…" : `${filtered.length} of ${(requests ?? []).length}`}
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Property</th>
                  <th>Tenant</th>
                  <th>Category</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: "right" }}>{tab === "active" ? "Age" : "Completed"}</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>
                    No requests. {tab === "active" && (requests?.length ?? 0) === 0 && "Use Backfill to import from Airtable, or click an email in the Inbox tab to create one."}
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
                      <td style={{ fontWeight: 600 }}>
                        {r.subject}
                        {tab === "active" && r.status !== "New" && (
                          <span style={{ marginLeft: 8 }}><Pill style={sStyle}>{r.status}</Pill></span>
                        )}
                        {r.notes.length > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>💬 {r.notes.length}</span>
                        )}
                      </td>
                      <td>{r.priority ? <Pill style={pStyle}>{r.priority}</Pill> : <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>
                        {r.assignedTo
                          ? STAFF.find((s) => s.id === r.assignedTo)?.name ?? r.assignedTo
                          : <span className="muted small" style={{ fontWeight: 400 }}>—</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.propertyName || <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 13 }}>{r.tenantName || r.tenantEmail || <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 12 }}>{r.categories.join(", ") || <span className="muted small">—</span>}</td>
                      <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatDate(r.submittedDate)}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                        {tab === "completed"
                          ? <span style={{ fontWeight: 500, color: "var(--muted)" }}>{formatDate(r.completedDate)}</span>
                          : age == null ? "—" : (
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

function Tile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{label}</div>
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

function BackfillButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    if (!confirm("Import all maintenance requests from Airtable? Existing portal records are kept; new Airtable rows are added.")) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/maintenance/backfill", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Backfill failed");
      setResult(`Imported ${body.imported}, skipped ${body.skipped} (already present).`);
      onDone();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {result && <span className="muted small">{result}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="btn"
        style={{ fontSize: 13, padding: "6px 12px" }}
      >
        {busy ? "Importing…" : "Backfill from Airtable"}
      </button>
    </div>
  );
}

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
          maxWidth: 760, width: "100%", padding: 24,
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
          <Pill style={sStyle}>{request.status}</Pill>
          {request.priority && <Pill style={pStyle}>{request.priority}</Pill>}
          {request.assignedTo && (
            <Pill style={{ bg: "rgba(11,74,125,0.10)", fg: "#0b4a7d", border: "rgba(11,74,125,0.30)" }}>
              {STAFF.find((s) => s.id === request.assignedTo)?.name ?? request.assignedTo}
            </Pill>
          )}
          {request.categories.map((c) => (
            <Pill key={c} style={{ bg: "rgba(15,23,42,0.05)", fg: "#475569", border: "rgba(15,23,42,0.15)" }}>{c}</Pill>
          ))}
        </div>

        {/* Action row: status / priority / assignee */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
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

        <Row label="Property" value={request.propertyName} />
        <Row label="Tenant" value={request.tenantName ? `${request.tenantName} <${request.tenantEmail}>` : request.tenantEmail} />
        <Row label="Submitted" value={formatDate(request.submittedDate)} />
        {request.status === "Complete" && <Row label="Completed" value={formatDate(request.completedDate)} />}

        {request.aiSummary && (
          <Section title="AI Summary">
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{request.aiSummary}</div>
          </Section>
        )}

        {/* Categories — editable as a chip group */}
        <Section title="Categories">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {REQUEST_CATEGORIES.map((c) => {
              const on = request.categories.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => patch({ categories: on ? request.categories.filter((x) => x !== c) : [...request.categories, c as RequestCategory] })}
                  disabled={busy}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                    border: on ? "1px solid rgba(11,74,125,0.45)" : "1px solid var(--border)",
                    background: on ? "rgba(11,74,125,0.10)" : "var(--card)",
                    color: on ? "#0b4a7d" : "var(--muted)",
                    cursor: busy ? "default" : "pointer",
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Notes */}
        <Section title={`Notes (${request.notes.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {request.notes.length === 0 && <div className="muted small">No notes yet.</div>}
            {request.notes.map((n) => (
              <div key={n.id} style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "rgba(15,23,42,0.02)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>
                  {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                </div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.text}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 4 }}>
              <Field label="Author">
                <select value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value as StaffId)} style={selectStyle}>
                  {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <textarea
                placeholder="Add a note…"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={2}
                style={{ ...selectStyle, flex: 1, minHeight: 40, fontFamily: "inherit", resize: "vertical" }}
              />
              <button
                onClick={addNote}
                disabled={busy || !draftNote.trim()}
                className="btn primary"
                style={{ fontSize: 13, padding: "8px 14px" }}
              >
                Add note
              </button>
            </div>
          </div>
        </Section>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, alignItems: "center" }}>
          <button
            onClick={remove}
            disabled={busy}
            style={{
              fontSize: 12, color: "#b91c1c", background: "transparent",
              border: "1px solid rgba(220,38,38,0.30)", borderRadius: 6,
              padding: "5px 10px", cursor: "pointer",
            }}
          >
            Delete
          </button>
          {request.status !== "Complete" ? (
            <button
              onClick={() => patch({ status: "Complete" })}
              disabled={busy}
              className="btn primary"
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              ✓ Mark Complete
            </button>
          ) : (
            <button
              onClick={() => patch({ status: "In Progress" })}
              disabled={busy}
              className="btn"
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              Reopen
            </button>
          )}
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
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

// ── Inbox tab (re-exported from previous PR, lightly trimmed) ──────────────

function Inbox() {
  const [emails, setEmails] = useState<MaintenanceEmail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MaintenanceEmail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/maintenance/emails")
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) { setError(body.error ?? "Failed to load"); setEmails([]); }
        else setEmails(body.emails ?? []);
      })
      .catch((e) => alive && setError(e?.message ?? "Network error"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!emails) return [];
    const q = search.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) =>
      [e.subject, e.fromName, e.fromEmail, e.textBody].join(" ").toLowerCase().includes(q),
    );
  }, [emails, search]);

  return (
    <>
      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Couldn't load inbox</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Search">
          <input
            type="search"
            placeholder="Subject, sender, body…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...selectStyle, minWidth: 280 }}
          />
        </Field>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          {loading ? "Loading…" : `${filtered.length} email${filtered.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Preview</th>
                <th style={{ whiteSpace: "nowrap" }}>Received</th>
                <th style={{ textAlign: "right" }}>📎</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>}
              {!loading && filtered.length === 0 && !error && (
                <tr><td colSpan={5} className="muted small" style={{ padding: 16 }}>
                  Inbox is empty. Configure your inbound webhook (POST → <code>/api/maintenance/inbound?token=…</code>) and forward your maintenance@ mailbox to it.
                </td></tr>
              )}
              {filtered.map((e) => {
                const preview = e.textBody.replace(/\s+/g, " ").trim().slice(0, 100);
                const received = new Date(e.receivedAt);
                return (
                  <tr
                    key={e.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(e)}
                    onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                    onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.filter = ""; }}
                  >
                    <td style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                      {e.fromName || e.fromEmail}
                      {e.fromName && <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>{e.fromEmail}</div>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{e.subject || <span className="muted small">(no subject)</span>}</td>
                    <td className="muted small">{preview}{e.textBody.length > 100 ? "…" : ""}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap", color: "var(--muted)" }}>
                      {received.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" · "}
                      {received.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>
                      {e.attachmentCount > 0 ? e.attachmentCount : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <EmailModal email={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function EmailModal({ email, onClose }: { email: MaintenanceEmail; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{email.subject || "(no subject)"}</h2>
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

        <Row label="From" value={email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail} />
        <Row label="To" value={email.to} />
        {email.cc && <Row label="Cc" value={email.cc} />}
        <Row label="Received" value={new Date(email.receivedAt).toLocaleString()} />

        <Section title="Body">
          <div style={{
            fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            maxHeight: 400, overflowY: "auto",
            padding: 12, background: "rgba(15,23,42,0.025)",
            border: "1px solid var(--border)", borderRadius: 8,
          }}>
            {email.textBody || <span className="muted small">(no plain-text body)</span>}
          </div>
        </Section>

        {email.attachments.length > 0 && (
          <Section title={`Attachments (${email.attachments.length})`}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {email.attachments.map((a, i) => (
                <li key={i}>
                  {a.name}
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    {a.contentType}{a.size ? ` · ${Math.round(a.size / 1024)} KB` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
