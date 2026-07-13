"use client";

// My To-Do — a private, per-user task list. Separate from the shared recurring
// Task Tracker: this is for one-off things ("Nancy asked me to send the CAM
// figures"), grouped by when they're due so "this week" is front and center.

import { useCallback, useEffect, useMemo, useState } from "react";
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
  padding: "9px 11px",
  fontSize: 14,
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "inherit",
};

// Friendly due label: "Today", "Tomorrow", "3d overdue", or "Mon, Jul 20".
function formatDue(due: string, now: Date): { label: string; tone: string } {
  const d = parseDueDate(due);
  if (!d) return { label: "", tone: "var(--muted)" };
  const today = startOfDay(now);
  const dayMs = 86_400_000;
  const diff = Math.round((d.getTime() - today.getTime()) / dayMs);
  const nice = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: RED };
  if (diff === 0) return { label: "Today", tone: AMBER };
  if (diff === 1) return { label: "Tomorrow", tone: AMBER };
  return { label: nice, tone: "var(--muted)" };
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editNote, setEditNote] = useState("");

  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/todos")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setTodos(Array.isArray(j.todos) ? j.todos : []);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addTodo(dueOverride?: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, due: dueOverride ?? due ?? null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to add");
      setTodos((prev) => [...prev, j.todo]);
      setText(""); setDue("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, fields: Partial<Pick<Todo, "text" | "due" | "note" | "done">>) {
    // Optimistic — reconcile with server response.
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setTodos((prev) => prev.map((t) => (t.id === id ? j.todo : t)));
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
      load();
    }
  }

  async function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch("/api/todos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      load();
    }
  }

  function beginEdit(t: Todo) {
    setEditId(t.id); setEditText(t.text); setEditDue(t.due ?? ""); setEditNote(t.note ?? "");
  }
  function saveEdit() {
    if (!editId) return;
    const t = editText.trim();
    if (!t) return;
    patch(editId, { text: t, due: editDue || null, note: editNote.trim() || undefined });
    setEditId(null);
  }

  const now = new Date();
  const buckets = useMemo(() => bucketTodos(todos, now), [todos, now.toDateString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCount = buckets.overdue.length + buckets.thisWeek.length + buckets.later.length + buckets.someday.length;

  const SECTIONS: { key: keyof typeof buckets; label: string; accent: string }[] = [
    { key: "overdue", label: "Overdue", accent: RED },
    { key: "thisWeek", label: "This Week", accent: BRAND },
    { key: "later", label: "Later", accent: "var(--muted)" },
    { key: "someday", label: "No date", accent: "var(--muted)" },
  ];

  function Row({ t }: { t: Todo }) {
    if (editId === t.id) {
      return (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderColor: BRAND }}>
          <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
            style={{ ...inputStyle, width: "100%" }} placeholder="Task" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} style={inputStyle} />
            <input value={editNote} onChange={(e) => setEditNote(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} placeholder="Note (optional)" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={saveEdit} style={{ fontWeight: 700 }}>Save</button>
            <button className="btn" onClick={() => setEditId(null)}>Cancel</button>
          </div>
        </div>
      );
    }
    const dueInfo = t.due ? formatDue(t.due, now) : null;
    return (
      <div className="todo-row" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }}>
        <button
          onClick={() => patch(t.id, { done: !t.done })}
          aria-label={t.done ? "Mark not done" : "Mark done"}
          style={{
            flexShrink: 0, marginTop: 1, width: 20, height: 20, borderRadius: 6, cursor: "pointer",
            border: `2px solid ${t.done ? GREEN : "var(--border)"}`,
            background: t.done ? GREEN : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}
        >
          {t.done && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => beginEdit(t)}>
          <div style={{ fontWeight: 600, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--muted)" : "var(--text)", cursor: "text", wordBreak: "break-word" }}>
            {t.text}
          </div>
          {t.note && <div className="small muted" style={{ marginTop: 2 }}>{t.note}</div>}
        </div>
        {dueInfo && !t.done && (
          <span className="small" style={{ flexShrink: 0, fontWeight: 700, color: dueInfo.tone, whiteSpace: "nowrap", marginTop: 1 }}>{dueInfo.label}</span>
        )}
        <button onClick={() => remove(t.id)} title="Delete" className="todo-del" style={{ flexShrink: 0, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, lineHeight: 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 760 }}>
      <style>{`.todo-del{opacity:0;transition:opacity .15s}.todo-row:hover .todo-del{opacity:1}`}</style>

      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND }}>Personal</div>
        <h1 style={{ margin: "2px 0 0", fontSize: 40 }}>My To-Do</h1>
        <div className="muted small" style={{ marginTop: 4 }}>
          Your own task list — private to you. {openCount > 0 ? `${openCount} open` : "All clear."}
        </div>
      </header>

      {/* Add */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }}
            placeholder="Add a task…  (e.g. Send Nancy the Q2 CAM figures)"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
          />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date (optional)" style={inputStyle} />
          <button className="btn" onClick={() => addTodo(endOfWeekISO(now))} disabled={busy || !text.trim()} title="Add due by the end of this week" style={{ fontWeight: 700 }}>
            This week
          </button>
          <button className="btn primary" onClick={() => addTodo()} disabled={busy || !text.trim()} style={{ fontWeight: 700 }}>
            Add
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", color: RED, fontWeight: 700, marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {openCount === 0 && buckets.done.length === 0 && (
            <div className="card muted" style={{ textAlign: "center", padding: 28 }}>No tasks yet — add one above.</div>
          )}

          {SECTIONS.map(({ key, label, accent }) => {
            const items = buckets[key];
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: accent }}>{label}</span>
                  <span className="small muted" style={{ fontWeight: 700 }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((t) => <Row key={t.id} t={t} />)}
                </div>
              </section>
            );
          })}

          {buckets.done.length > 0 && (
            <section>
              <button
                onClick={() => setShowDone((s) => !s)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--muted)", fontFamily: "inherit" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showDone ? "rotate(90deg)" : "none", transition: "transform .15s" }}><polyline points="9 6 15 12 9 18" /></svg>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>Done</span>
                <span className="small" style={{ fontWeight: 700 }}>{buckets.done.length}</span>
              </button>
              {showDone && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {buckets.done.map((t) => <Row key={t.id} t={t} />)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
