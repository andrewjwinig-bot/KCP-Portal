"use client";

// Personal to-do list — a private, per-user task list. Not a page of its own:
// it's embedded in the dashboard "Tasks This Week" card (compact) and on the
// Task Tracker page (full). Backed by /api/todos, scoped to the signed-in user.

import { useCallback, useEffect, useState } from "react";
import {
  type Todo,
  bucketTodos,
  endOfWeekISO,
  parseDueDate,
  startOfDay,
} from "@/lib/todos/types";

const BRAND = "#0b4a7d";
const RED = "#b91c1c";
const AMBER = "#b45309";
const GREEN = "#15803d";

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "inherit",
};

function formatDue(due: string, now: Date): { label: string; tone: string } {
  const d = parseDueDate(due);
  if (!d) return { label: "", tone: "var(--muted)" };
  const today = startOfDay(now);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const nice = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: RED };
  if (diff === 0) return { label: "Today", tone: AMBER };
  if (diff === 1) return { label: "Tomorrow", tone: AMBER };
  return { label: nice, tone: "var(--muted)" };
}

/** Personal to-do panel. `compact` trims it for the dashboard card (open items
 *  that need attention, quick add); full mode (tracker page) shows every bucket
 *  plus inline edit and a collapsible Done list. */
export default function MyTasks({ compact = false, title }: { compact?: boolean; title?: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editNote, setEditNote] = useState("");

  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/todos")
      .then((r) => (r.ok ? r.json() : { todos: [] }))
      .then((j) => { if (j.error) setError(j.error); else setTodos(Array.isArray(j.todos) ? j.todos : []); })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addTodo(dueOverride?: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, due: dueOverride ?? due ?? null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to add");
      setTodos((prev) => [...prev, j.todo]);
      setText(""); setDue("");
    } catch (e: any) { setError(e?.message ?? "Failed to add"); }
    finally { setBusy(false); }
  }

  async function patch(id: string, fields: Partial<Pick<Todo, "text" | "due" | "note" | "done">>) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setTodos((prev) => prev.map((t) => (t.id === id ? j.todo : t)));
    } catch (e: any) { setError(e?.message ?? "Failed to save"); load(); }
  }

  async function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch("/api/todos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    } catch { load(); }
  }

  function beginEdit(t: Todo) { setEditId(t.id); setEditText(t.text); setEditDue(t.due ?? ""); setEditNote(t.note ?? ""); }
  function saveEdit() {
    if (!editId) return;
    const t = editText.trim();
    if (!t) return;
    patch(editId, { text: t, due: editDue || null, note: editNote.trim() || undefined });
    setEditId(null);
  }

  const now = new Date();
  const buckets = bucketTodos(todos, now);

  function Row({ t }: { t: Todo }) {
    if (!compact && editId === t.id) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 8, border: `1px solid ${BRAND}` }}>
          <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
            style={{ ...inputStyle, width: "100%" }} placeholder="Task" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} style={inputStyle} />
            <input value={editNote} onChange={(e) => setEditNote(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 140 }} placeholder="Note (optional)" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={saveEdit} style={{ fontWeight: 700, fontSize: 12, padding: "5px 12px" }}>Save</button>
            <button className="btn" onClick={() => setEditId(null)} style={{ fontSize: 12, padding: "5px 12px" }}>Cancel</button>
          </div>
        </div>
      );
    }
    const dueInfo = t.due ? formatDue(t.due, now) : null;
    return (
      <div className="mytask-row" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(15,23,42,0.02)" }}>
        <button
          onClick={() => patch(t.id, { done: !t.done })}
          aria-label={t.done ? "Mark not done" : "Mark done"}
          style={{
            flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 5, cursor: "pointer", padding: 0,
            border: `2px solid ${t.done ? GREEN : "var(--border)"}`, background: t.done ? GREEN : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {t.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: compact ? "default" : "text" }} onClick={() => { if (!compact) beginEdit(t); }}>
          <div style={{ fontSize: 13, fontWeight: 600, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--muted)" : "var(--text)", wordBreak: "break-word" }}>{t.text}</div>
          {t.note && !compact && <div className="muted small" style={{ marginTop: 2 }}>{t.note}</div>}
        </div>
        {dueInfo && !t.done && <span className="small" style={{ flexShrink: 0, fontWeight: 700, color: dueInfo.tone, whiteSpace: "nowrap", marginTop: 1 }}>{dueInfo.label}</span>}
        <button onClick={() => remove(t.id)} title="Delete" className="mytask-del" style={{ flexShrink: 0, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, lineHeight: 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    );
  }

  const openCount = buckets.overdue.length + buckets.thisWeek.length + buckets.later.length + buckets.someday.length;

  // Section list differs by mode: compact shows only what needs attention now;
  // full shows every bucket.
  const sections: { key: keyof typeof buckets; label: string; accent: string }[] = compact
    ? [
        { key: "overdue", label: "Overdue", accent: RED },
        { key: "thisWeek", label: "This Week", accent: BRAND },
      ]
    : [
        { key: "overdue", label: "Overdue", accent: RED },
        { key: "thisWeek", label: "This Week", accent: BRAND },
        { key: "later", label: "Later", accent: "var(--muted)" },
        { key: "someday", label: "No date", accent: "var(--muted)" },
      ];

  const compactExtra = compact ? buckets.later.length + buckets.someday.length : 0;

  return (
    <div>
      <style>{`.mytask-del{opacity:0;transition:opacity .15s}.mytask-row:hover .mytask-del{opacity:1}`}</style>

      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{title}</span>
          {openCount > 0 && <span className="small muted" style={{ fontWeight: 700 }}>{openCount}</span>}
        </div>
      )}

      {/* Add */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: openCount || !loading ? 10 : 0 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }}
          placeholder={compact ? "Add a personal to-do…" : "Add a task…  (e.g. Send Nancy the Q2 CAM figures)"}
          style={{ ...inputStyle, flex: 1, minWidth: compact ? 140 : 220 }}
        />
        {!compact && <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date (optional)" style={inputStyle} />}
        <button className="btn" onClick={() => addTodo(endOfWeekISO(now))} disabled={busy || !text.trim()} title="Add due by the end of this week" style={{ fontWeight: 700, fontSize: 12, padding: "6px 10px" }}>This week</button>
        <button className="btn primary" onClick={() => addTodo()} disabled={busy || !text.trim()} style={{ fontWeight: 700, fontSize: 12, padding: "6px 12px" }}>Add</button>
      </div>

      {error && <div className="small" style={{ color: RED, fontWeight: 700, marginBottom: 8 }}>{error}</div>}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 16 }}>
          {openCount === 0 && (buckets.done.length === 0 || compact) && (
            <div className="muted small">{compact ? "No personal to-dos." : "No tasks yet — add one above."}</div>
          )}

          {sections.map(({ key, label, accent }) => {
            const items = buckets[key];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: accent }}>{label}</span>
                  <span className="small muted" style={{ fontWeight: 700 }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map((t) => <Row key={t.id} t={t} />)}
                </div>
              </div>
            );
          })}

          {compact && compactExtra > 0 && (
            <div className="muted small">+{compactExtra} scheduled later — see the Tracker.</div>
          )}

          {!compact && buckets.done.length > 0 && (
            <div>
              <button onClick={() => setShowDone((s) => !s)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: "var(--muted)", fontFamily: "inherit" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showDone ? "rotate(90deg)" : "none", transition: "transform .15s" }}><polyline points="9 6 15 12 9 18" /></svg>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>Done</span>
                <span className="small" style={{ fontWeight: 700 }}>{buckets.done.length}</span>
              </button>
              {showDone && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{buckets.done.map((t) => <Row key={t.id} t={t} />)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
