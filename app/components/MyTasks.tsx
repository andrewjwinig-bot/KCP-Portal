"use client";

// Personal to-do list — a private, per-user task list. Not a page of its own:
// it's embedded in the dashboard "Tasks This Week" card (compact) and on the
// Task Tracker page (full). New tasks are added through a modal (text, due date,
// repeat, importance, note). Backed by /api/todos, scoped to the signed-in user.

import { useCallback, useEffect, useState } from "react";
import {
  type Priority,
  type Repeat,
  type Todo,
  PRIORITIES,
  REPEATS,
  REPEAT_LABELS,
  bucketTodos,
  endOfWeekISO,
  parseDueDate,
  priorityOf,
  startOfDay,
} from "@/lib/todos/types";

const BRAND = "#0b4a7d";
const RED = "#b91c1c";
const AMBER = "#b45309";
const GREEN = "#15803d";

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  high: { label: "High", color: RED },
  normal: { label: "Normal", color: "var(--muted)" },
  low: { label: "Low", color: "#94a3b8" },
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px",
  fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "inherit",
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

function PriorityFlag({ p }: { p: Priority }) {
  if (p === "normal") return null;
  const c = PRIORITY_META[p].color;
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={p === "high" ? c : "none"} stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-label={`${PRIORITY_META[p].label} priority`}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// ── Add / edit modal ──────────────────────────────────────────────────────────
export function TaskModal({ initial, onClose, onSave }: {
  initial?: Todo;
  onClose: () => void;
  onSave: (fields: { text: string; due: string | null; repeat: Repeat; priority: Priority; note?: string }) => Promise<void>;
}) {
  const now = new Date();
  const [text, setText] = useState(initial?.text ?? "");
  const [due, setDue] = useState(initial?.due ?? "");
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? "none");
  const [priority, setPriority] = useState<Priority>(priorityOf(initial ?? ({} as Todo)));
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const t = text.trim();
    if (!t) { setErr("Task text is required"); return; }
    setBusy(true); setErr(null);
    try {
      await onSave({ text: t, due: due || null, repeat, priority, note: note.trim() || undefined });
      onClose();
    } catch (e: any) { setErr(e?.message ?? "Failed to save"); setBusy(false); }
  }

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 16px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--card)", borderRadius: 14, boxShadow: "0 20px 50px rgba(15,23,42,0.3)", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{initial ? "Edit task" : "New task"}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={label}>Task</label>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
              placeholder="e.g. Send Nancy the Q2 CAM figures" style={{ ...inputStyle, width: "100%" }} />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={label}>Due date <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button onClick={() => setDue(endOfWeekISO(now))} title="Due by the end of this week" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: BRAND }}>This week</button>
                {due && <button onClick={() => setDue("")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Clear</button>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={label}>Repeat</label>
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} style={{ ...inputStyle, width: "100%" }}>
                {REPEATS.map((r) => <option key={r} value={r}>{REPEAT_LABELS[r]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={label}>Importance</label>
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {PRIORITIES.map((p) => {
                const active = priority === p;
                const c = PRIORITY_META[p].color;
                return (
                  <button key={p} onClick={() => setPriority(p)} style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
                    fontFamily: "inherit", borderLeft: p !== "high" ? "1px solid var(--border)" : "none",
                    background: active ? (p === "normal" ? "var(--brand)" : c) : "transparent",
                    color: active ? "#fff" : "var(--text)",
                  }}>{PRIORITY_META[p].label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={label}>Note <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who asked, context…" style={{ ...inputStyle, width: "100%" }} />
          </div>

          {err && <div className="small" style={{ color: RED, fontWeight: 700 }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button className="btn" onClick={onClose} style={{ fontWeight: 700 }}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={busy || !text.trim()} style={{ fontWeight: 700 }}>{initial ? "Save" : "Add task"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Personal to-do panel. `compact` trims it for the dashboard card; full mode
 *  (tracker page) shows every bucket plus a collapsible Done list. */
export default function MyTasks({ compact = false, title }: { compact?: boolean; title?: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { edit?: Todo }>(null);
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

  async function createTodo(fields: { text: string; due: string | null; repeat: Repeat; priority: Priority; note?: string }) {
    const res = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to add");
    setTodos((prev) => [...prev, j.todo]);
  }

  async function editTodo(id: string, fields: { text: string; due: string | null; repeat: Repeat; priority: Priority; note?: string }) {
    const res = await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to save");
    setTodos((prev) => prev.map((t) => (t.id === id ? j.todo : t)));
  }

  async function toggleDone(t: Todo) {
    const done = !t.done;
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done } : x)));
    try {
      const res = await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, done }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setTodos((prev) => {
        const updated = prev.map((x) => (x.id === t.id ? j.todo : x));
        return j.next ? [...updated, j.next] : updated; // recurring → next occurrence
      });
    } catch (e: any) { setError(e?.message ?? "Failed to save"); load(); }
  }

  async function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try { await fetch("/api/todos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); }
    catch { load(); }
  }

  const now = new Date();
  const buckets = bucketTodos(todos, now);
  const openCount = buckets.overdue.length + buckets.thisWeek.length + buckets.later.length + buckets.someday.length;

  function Row({ t }: { t: Todo }) {
    const dueInfo = t.due ? formatDue(t.due, now) : null;
    const p = priorityOf(t);
    return (
      <div className="mytask-row" style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(15,23,42,0.02)", borderLeft: p === "high" ? `3px solid ${RED}` : undefined }}>
        <button onClick={() => toggleDone(t)} aria-label={t.done ? "Mark not done" : "Mark done"} style={{
          flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 5, cursor: "pointer", padding: 0,
          border: `2px solid ${t.done ? GREEN : "var(--border)"}`, background: t.done ? GREEN : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {t.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setModal({ edit: t })}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PriorityFlag p={p} />
            <span style={{ fontSize: 13, fontWeight: 600, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--muted)" : "var(--text)", wordBreak: "break-word" }}>{t.text}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: t.note && !compact ? 2 : 0 }}>
            {t.repeat && t.repeat !== "none" && (
              <span className="small" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: BRAND, fontWeight: 700 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                {REPEAT_LABELS[t.repeat]}
              </span>
            )}
            {t.note && !compact && <span className="muted small">{t.note}</span>}
          </div>
        </div>
        {dueInfo && !t.done && <span className="small" style={{ flexShrink: 0, fontWeight: 700, color: dueInfo.tone, whiteSpace: "nowrap", marginTop: 1 }}>{dueInfo.label}</span>}
        <button onClick={() => remove(t.id)} title="Delete" className="mytask-del" style={{ flexShrink: 0, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, lineHeight: 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    );
  }

  const sections: { key: keyof typeof buckets; label: string; accent: string }[] = compact
    ? [{ key: "overdue", label: "Overdue", accent: RED }, { key: "thisWeek", label: "This Week", accent: BRAND }]
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

      {/* Header: title + New button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {title && <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{title}</span>}
          {openCount > 0 && <span className="small muted" style={{ fontWeight: 700 }}>{openCount}</span>}
        </div>
        <button className="btn primary" onClick={() => setModal({})} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New task
        </button>
      </div>

      {error && <div className="small" style={{ color: RED, fontWeight: 700, marginBottom: 8 }}>{error}</div>}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 16 }}>
          {openCount === 0 && (buckets.done.length === 0 || compact) && (
            <div className="muted small">{compact ? "No personal to-dos — add one with “New task”." : "No tasks yet — add one with “New task”."}</div>
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

          {compact && compactExtra > 0 && <div className="muted small">+{compactExtra} scheduled later — see the Tracker.</div>}

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

      {modal && (
        <TaskModal
          initial={modal.edit}
          onClose={() => setModal(null)}
          onSave={(fields) => (modal.edit ? editTodo(modal.edit.id, fields) : createTodo(fields))}
        />
      )}
    </div>
  );
}
