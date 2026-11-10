"use client";

import { ChevronRight, CircleCheck, Flag, Plus } from "lucide-react";
import { RoundCheck } from "@/app/components/RoundCheck";
import { ImportStepsButton } from "@/app/components/ImportStepsButton";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, taskOccurrencesBetween, type TaskOccurrence, type TaskOwner } from "../../lib/tracker/taskDefs";
import { importsForWeek, reminderSatisfied, type ImportReminder, type ImportEvent, type ImportCoverage } from "../../lib/tracker/imports";
import { TaskModal } from "../components/MyTasks";
import { type Priority, type Repeat, type Todo, openBucketOf, parseDueDate, priorityOf, startOfDay } from "@/lib/todos/types";

const BRAND = "var(--c-0b4a7d)";
const RED = "var(--c-b91c1c)";
const GREEN = "var(--c-15803d)";

// Mirrors the tracker page's per-month localStorage key, so checking a task
// off here keeps it in sync with the Task Tracker on the same browser.
function monthKey(d: Date): string {
  return `tracker-v2-${d.getFullYear()}-${d.getMonth()}`;
}

// Priority dot color for personal to-dos (high shows a flag instead).
function dotFor(p: Priority): string {
  return p === "high" ? RED : p === "low" ? "var(--c-94a3b8)" : BRAND;
}

// Unified date badge for a task row: "Today" / "Nd overdue" / "Wed, Jul 15".
function dateBadge(date: Date, now: Date): { text: string; color: string; bold: boolean } {
  const today = startOfDay(now).getTime();
  const d = startOfDay(date).getTime();
  const diff = Math.round((d - today) / 86_400_000);
  if (diff === 0) return { text: "Today", color: "var(--text)", bold: true };
  if (diff < 0) return { text: `${-diff}d overdue`, color: RED, bold: true };
  return { text: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), color: "var(--muted)", bold: false };
}

// A single task row (recurring tracker task OR personal to-do — same look).
type Item = { key: string; label: string; date: Date | null; dot: string; flag: boolean; onToggle: () => void };
function TaskRow({ item, now }: { item: Item; now: Date }) {
  const b = item.date ? dateBadge(item.date, now) : null;
  const overdue = b?.color === RED;
  // One row style: a round check on the left, the task, its date on the right.
  // No box, no tint — a hairline between rows; red only when it is overdue.
  return (
    <div className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: "1px solid var(--hairline, var(--border))" }}>
      <RoundCheck done={false} onToggle={item.onToggle} label={`Mark ${item.label} done`} />
      {item.flag && <Flag size={16} strokeWidth={1.75} color={RED} fill={RED} aria-label="High priority" style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: 600, wordBreak: "break-word", lineHeight: 1.3 }}>{item.label}</div>
      {b && <div style={{ flexShrink: 0, fontSize: "var(--fs-12-5)", color: overdue ? RED : "var(--muted)", fontWeight: overdue ? 700 : 500, whiteSpace: "nowrap" }}>{b.text}</div>}
    </div>
  );
}

/** Drew's master-tracker tasks due this week + personal to-dos, checkable in
 *  place. Dated to-dos merge into the weekly list; undated ones ("ongoing")
 *  fall to an Open Tasks list below. */
export default function DrewTasksThisWeek({ owner = "drew" }: { owner?: TaskOwner } = {}) {
  // Nancy has no Task Tracker page — her card carries no link to it.
  const trackerLink = owner !== "nancy";
  const { occ, imports } = useMemo<{ occ: TaskOccurrence[]; imports: ImportReminder[] }>(() => {
    const now = new Date();
    const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → start week on Monday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
    // Only this person's tasks and imports — Harry no longer sees Drew's (owner).
    return {
      occ: taskOccurrencesBetween(start, end).filter((o) => o.owner === owner),
      imports: importsForWeek(start, end).filter((r) => (r.owner ?? "drew") === owner),
    };
  }, [owner]);

  const [checked, setChecked] = useState<Record<string, Record<string, boolean>>>({});
  useEffect(() => {
    const maps: Record<string, Record<string, boolean>> = {};
    for (const o of occ) {
      const k = monthKey(o.date);
      if (maps[k]) continue;
      try { maps[k] = JSON.parse(localStorage.getItem(k) ?? "{}"); }
      catch { maps[k] = {}; }
    }
    setChecked(maps);

    // Merge in SERVER-recorded completions (a task finished by someone else
    // auto-checks here too). Keyed `<year>-<month0>-<taskId>`.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tracker/completions", { cache: "no-store" });
        if (!res.ok) return;
        const { completions } = (await res.json()) as { completions: Record<string, { at: string }> };
        if (cancelled || !completions) return;
        setChecked((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(completions)) {
            const idx = key.indexOf("-", key.indexOf("-") + 1);
            if (idx < 0) continue;
            const prefix = key.slice(0, idx), taskId = key.slice(idx + 1);
            const k = `tracker-v2-${prefix}`;
            if (!next[k]) next[k] = { ...(prev[k] ?? {}) };
            next[k] = { ...next[k], [taskId]: true };
          }
          return next;
        });
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [occ]);

  // Files to import this week.
  const [importEvents, setImportEvents] = useState<Record<string, ImportEvent>>({});
  const [importCoverage, setImportCoverage] = useState<Record<string, ImportCoverage>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tracker/import-events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.events) { setImportEvents(j.events); setImportCoverage(j.coverage ?? {}); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Personal to-dos (private per user).
  const [todos, setTodos] = useState<Todo[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/todos").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && Array.isArray(j?.todos)) setTodos(j.todos); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  function toggleRecurring(o: TaskOccurrence) {
    const k = monthKey(o.date);
    setChecked((prev) => {
      const monthMap = { ...(prev[k] ?? {}), [o.id]: !prev[k]?.[o.id] };
      try { localStorage.setItem(k, JSON.stringify(monthMap)); } catch { /* ignore */ }
      return { ...prev, [k]: monthMap };
    });
  }
  async function toggleTodo(t: Todo) {
    const done = !t.done;
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done } : x)));
    try {
      const res = await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, done }) });
      const j = await res.json();
      if (!res.ok) throw new Error();
      setTodos((prev) => { const u = prev.map((x) => (x.id === t.id ? j.todo : x)); return j.next ? [...u, j.next] : u; });
    } catch { /* revert */ setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !done } : x))); }
  }
  async function createTodo(fields: { text: string; due: string | null; repeat: Repeat; priority: Priority; note?: string }) {
    const res = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to add");
    setTodos((prev) => [...prev, j.todo]);
  }

  const now = new Date();

  const visibleRecurring = occ.filter((o) => !checked[monthKey(o.date)]?.[o.id]);
  const doneCount = occ.length - visibleRecurring.length;
  const openTodos = todos.filter((t) => !t.done);
  const weekTodos = openTodos.filter((t) => { const b = openBucketOf(t, now); return b === "overdue" || b === "thisWeek"; });
  const openTasks = openTodos.filter((t) => openBucketOf(t, now) === "someday"); // no due date — "ongoing"
  const laterCount = openTodos.filter((t) => openBucketOf(t, now) === "later").length;

  // Merged weekly list: recurring occurrences + dated personal to-dos, by date.
  const weekList: Item[] = [
    ...visibleRecurring.map((o) => ({ key: `rec-${o.id}`, label: o.label, date: o.date, dot: CATEGORIES[o.category]?.dot ?? "var(--c-64748b)", flag: false, onToggle: () => toggleRecurring(o) })),
    ...weekTodos.map((t) => ({ key: `todo-${t.id}`, label: t.text, date: parseDueDate(t.due), dot: dotFor(priorityOf(t)), flag: priorityOf(t) === "high", onToggle: () => toggleTodo(t) })),
  ].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const openTaskItems: Item[] = [...openTasks]
    .sort((a, b) => (priorityOf(a) === "high" ? -1 : 0) - (priorityOf(b) === "high" ? -1 : 0))
    .map((t) => ({ key: `todo-${t.id}`, label: t.text, date: null, dot: dotFor(priorityOf(t)), flag: priorityOf(t) === "high", onToggle: () => toggleTodo(t) }));

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Tasks This Week{doneCount > 0 && <span style={{ marginLeft: 8, color: GREEN, letterSpacing: 0 }}>· {doneCount} done</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setModalOpen(true)} className="btn sm">
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            New task
          </button>
          {trackerLink && <Link href="/tracker" className="text-link">Tracker<ChevronRight size={16} strokeWidth={1.75} aria-hidden /></Link>}
        </div>
      </div>

      {weekList.length === 0 ? (
        <div className="muted small">No tasks due this week.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {weekList.map((it) => <TaskRow key={it.key} item={it} now={now} />)}
        </div>
      )}

      {imports.length > 0 && (() => {
        // Once a file is imported it drops off — the list shows only what's still
        // outstanding. When everything's in, a single "all imported" line.
        // Coverage (the ledger / the statement store) beats the import log, as
        // on the Imports card — or a month that is in still reads as due.
        const outstanding = imports.filter((r) => !reminderSatisfied(r, importEvents[r.id]?.at, new Date(), importCoverage[r.id]));
        return (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: outstanding.length ? "var(--c-b45309)" : GREEN, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: outstanding.length ? "var(--c-b45309)" : GREEN, flexShrink: 0 }} />
              Files to Import This Week{outstanding.length ? ` · ${outstanding.length} outstanding` : ""}
            </div>
            {outstanding.length === 0 ? (
              <div className="small" style={{ color: GREEN, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><CircleCheck size={16} strokeWidth={1.75} aria-hidden />All files imported this week.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {outstanding.map((r) => (
                  <Link key={r.id} href={r.link} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--tint-amber-line, rgba(180,83,9,0.28))", background: "var(--tint-amber-bg, rgba(180,83,9,0.06))", textDecoration: "none", color: "inherit" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--c-b45309)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--c-7c3d06)" }}>{r.label}<ImportStepsButton id={r.id} /></div>
                      <div className="muted small" style={{ marginTop: 1 }}>feeds {r.feeds}</div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--c-b45309)" }}>{r.when}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {openTaskItems.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>
            Open Tasks <span style={{ fontWeight: 400, textTransform: "none" }}>· no due date</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {openTaskItems.map((it) => <TaskRow key={it.key} item={it} now={now} />)}
          </div>
        </div>
      )}

      {laterCount > 0 && <div className="muted small" style={{ marginTop: 10 }}>+{laterCount} scheduled later — see the Tracker.</div>}

      {modalOpen && (
        <TaskModal onClose={() => setModalOpen(false)} onSave={(fields) => createTodo(fields)} />
      )}
    </div>
  );
}
