"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  TAX_TASKS, TAX_CATEGORIES,
  loadTaxChecked, saveTaxChecked,
  masterTrackerLabel, isTaskEffectivelyDone,
} from "./tax-data";
import {
  STACIE_TASKS,
  FREQUENCY_LABELS, FREQUENCY_ORDER,
  checkedKey, currentPeriod,
  type Frequency,
} from "../../lib/stacie-tasks";
import { useUser } from "../components/UserProvider";
import { UNIQUE_BANK_ACCOUNTS } from "../../lib/bank-rec/accounts";
import { bankRecKey, bankRecPeriod } from "../../lib/bank-rec/util";
import {
  MONTHS, WEEKDAYS, CATEGORIES, TASK_DEFS,
  tasksForMonth, effDay, daysInMonth, firstDOW, dueName,
  type Category, type TaskDef, type TaskInstructions,
} from "../../lib/tracker/taskDefs";

type OwnerFilter = "drew" | "stacie" | "both";

const OWNER_FILTERS: { id: OwnerFilter; label: string }[] = [
  { id: "drew",   label: "Drew" },
  { id: "stacie", label: "Marie" },
  { id: "both",   label: "Both" },
];

// ─── CONSTANTS ──────────────────────────────────────────────────────────────


// ─── STORAGE ────────────────────────────────────────────────────────────────

function storageKey(year: number, month: number) {
  return `tracker-v2-${year}-${month}`;
}
function loadChecked(year: number, month: number): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(storageKey(year, month)) ?? "{}"); }
  catch { return {}; }
}
function saveChecked(year: number, month: number, data: Record<string, boolean>) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

// ─── PAGE ───────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const today = new Date();
  const { user } = useUser();

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [checked,   setChecked]   = useState<Record<string, boolean>>({});
  const [taxChecked, setTaxChecked] = useState<Record<string, boolean>>({});
  const [selDay,    setSelDay]    = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<Category | "all">("all");
  const [detailTask, setDetailTask] = useState<{ label: string; instructions?: TaskInstructions } | null>(null);

  // ── Owner filter: Drew (default for admin/maint), Marie (default for stacie), Both ──
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>(
    user.id === "stacie" ? "stacie" : "drew",
  );
  useEffect(() => {
    setOwnerFilter(user.id === "stacie" ? "stacie" : "drew");
  }, [user.id]);

  // ── Marie task state (period-bucketed, synced to /api/stacie-tasks) ──
  const [stacieChecked, setStacieChecked] = useState<Record<string, boolean>>({});
  const [stacieLoading, setStacieLoading] = useState(true);
  const [stacieError,   setStacieError]   = useState<string | null>(null);
  const [openFreqs, setOpenFreqs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FREQUENCY_ORDER.map((f) => [f, true])),
  );

  // Only fetch Marie's task state when the view actually needs it
  const showStacie = ownerFilter !== "drew";
  useEffect(() => {
    if (!showStacie) return;
    setStacieLoading(true);
    fetch("/api/stacie-tasks")
      .then((r) => r.json())
      .then((j) => setStacieChecked(j.checked ?? {}))
      .catch(() => {})
      .finally(() => setStacieLoading(false));
  }, [showStacie]);

  // Live bank rec progress for the per-task progress bars
  const [bankStmtMap, setBankStmtMap] = useState<Record<string, boolean>>({});
  const [bankRecMap,  setBankRecMap]  = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!showStacie) return;
    fetch("/api/bank-rec/statements").then((r) => r.json()).then((j) => setBankStmtMap(j.statements ?? {})).catch(() => {});
    fetch("/api/bank-rec").then((r) => r.json()).then((j) => setBankRecMap(j.checked ?? {})).catch(() => {});
  }, [showStacie]);

  function bankProgress(kind: "statements" | "reconciled"): { done: number; total: number } {
    const period = bankRecPeriod();
    const map = kind === "statements" ? bankStmtMap : bankRecMap;
    const done = UNIQUE_BANK_ACCOUNTS.filter((a) => map[bankRecKey(a.last4, period)]).length;
    return { done, total: UNIQUE_BANK_ACCOUNTS.length };
  }

  useEffect(() => {
    setChecked(loadChecked(viewYear, viewMonth));
    setTaxChecked(loadTaxChecked(viewYear));
    setSelDay(null);
  }, [viewYear, viewMonth]);

  // ── Marie task helpers ───────────────────────────────────────────
  const stacieByFreq = useMemo(() => {
    const groups: Record<Frequency, typeof STACIE_TASKS> = {
      weekly: [], monthly: [], quarterly: [], semiannual: [], annual: [], ongoing: [], eoy: [],
    };
    for (const t of STACIE_TASKS) groups[t.frequency].push(t);
    return groups;
  }, []);

  async function toggleStacieTask(taskId: string, freq: Frequency) {
    const period = currentPeriod(freq);
    const key = checkedKey(taskId, period);
    const next = { ...stacieChecked };
    if (next[key]) delete next[key];
    else next[key] = true;
    setStacieChecked(next);
    try {
      const res = await fetch("/api/stacie-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      setStacieError(null);
    } catch (e: any) {
      setStacieError(e?.message ?? "Save failed");
    }
  }

  function toggleFreq(f: Frequency) {
    setOpenFreqs((prev) => ({ ...prev, [f]: !prev[f] }));
  }
  function isStacieChecked(taskId: string, freq: Frequency): boolean {
    return !!stacieChecked[checkedKey(taskId, currentPeriod(freq))];
  }
  function freqCount(freq: Frequency): { total: number; done: number } {
    const tasks = stacieByFreq[freq];
    let done = 0;
    for (const t of tasks) if (isStacieChecked(t.id, freq)) done++;
    return { total: tasks.length, done };
  }

  const tasks = useMemo(() => tasksForMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecked(viewYear, viewMonth, next);
      return next;
    });
  }, [viewYear, viewMonth]);

  const toggleTax = useCallback((id: string) => {
    setTaxChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveTaxChecked(viewYear, next);
      return next;
    });
  }, [viewYear]);

  // Tax tasks due in this month
  const taxTasksThisMonth = useMemo(() =>
    TAX_TASKS
      .filter(t => t.dueMonth === viewMonth + 1)
      .sort((a, b) => a.dueDay - b.dueDay),
    [viewMonth]
  );

  // Pinned tasks are always shown at top, never on the calendar
  const pinnedTasks = useMemo(() => TASK_DEFS.filter(t => t.pinned), []);

  // Tasks grouped by their effective calendar day (for dots) — excludes pinned
  const dayMap = useMemo(() => {
    const m: Record<number, TaskDef[]> = {};
    tasks.forEach(t => {
      if (t.pinned) return;
      const d = effDay(t, viewYear, viewMonth);
      (m[d] ??= []).push(t);
    });
    return m;
  }, [tasks, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const isPast = (d: number) => {
    const dt = new Date(viewYear, viewMonth, d);
    dt.setHours(23, 59, 59);
    return dt < today;
  };

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // ── Checklist filtering
  const visible = useMemo(() => {
    let list = tasks;
    if (selDay !== null)     list = list.filter(t => effDay(t, viewYear, viewMonth) === selDay);
    if (filterCat !== "all") list = list.filter(t => t.category === filterCat);
    return list;
  }, [tasks, selDay, filterCat, viewYear, viewMonth]);

  const sortedVisible = useMemo(() =>
    visible.filter(t => !t.pinned).sort((a, b) => {
      const doneA = checked[a.id] ? 1 : 0;
      const doneB = checked[b.id] ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return effDay(a, viewYear, viewMonth) - effDay(b, viewYear, viewMonth);
    }),
    [visible, checked, viewYear, viewMonth]
  );

  // ── Stats
  const total   = tasks.length;
  const done    = tasks.filter(t => checked[t.id]).length;
  const overdue = tasks.filter(t => !checked[t.id] && isCurrentMonth && isPast(effDay(t, viewYear, viewMonth))).length;
  const pending = total - done;

  // ── Status badge for a task row
  function taskStatus(t: TaskDef) {
    const d = effDay(t, viewYear, viewMonth);
    const name = dueName(t, viewYear, viewMonth);
    if (checked[t.id])
      return { label: "✓ Done",    color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.2)"  };
    if (isCurrentMonth && isPast(d))
      return { label: "Overdue",   color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" };
    if (isCurrentMonth && d === today.getDate())
      return { label: "Due today", color: "#ea580c", bg: "rgba(234,88,12,0.08)", border: "rgba(234,88,12,0.2)" };
    if (isCurrentMonth && d > today.getDate() && d - today.getDate() <= 3)
      return { label: "Due soon",  color: "#d97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)"  };
    return { label: `Due ${name}`, color: "var(--muted)", bg: "rgba(0,0,0,0.04)", border: "var(--border)" };
  }

  // ── Calendar cells
  const numDays = daysInMonth(viewYear, viewMonth);
  const offset  = firstDOW(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  return (
    <main>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1>Task Tracker</h1>
          <p className="muted small">Monthly to-do checklist · filing deadlines · recurring tasks</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </div>

      {/* ── Owner filter (Drew / Marie / Both) ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em" }}>VIEW</span>
        <div role="tablist" aria-label="Owner filter" style={{
          display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden", background: "var(--card)",
        }}>
          {OWNER_FILTERS.map((f) => {
            const active = ownerFilter === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setOwnerFilter(f.id)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12, fontWeight: 700,
                  background: active ? "var(--brand)" : "transparent",
                  color: active ? "#fff" : "var(--text)",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {showStacie && stacieError && (
          <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>· {stacieError}</span>
        )}
      </div>

      {ownerFilter !== "stacie" && (<>
      {/* ── Summary pills ────────────────────────────────────────────────── */}
      <div className="pills" style={{ justifyContent: "flex-start", marginBottom: 20 }}>
        <div className="pill">
          <b>{total}</b>
          <span className="muted small">Tasks this month</span>
        </div>
        <div className="pill" style={{ borderColor: "#16a34a", background: "rgba(22,163,74,0.06)" }}>
          <b style={{ color: "#16a34a" }}>{done}</b>
          <span className="muted small">Done</span>
        </div>
        <div className="pill">
          <b>{pending}</b>
          <span className="muted small">Remaining</span>
        </div>
        {overdue > 0 && (
          <div className="pill" style={{ borderColor: "#dc2626", background: "rgba(220,38,38,0.06)" }}>
            <b style={{ color: "#dc2626" }}>{overdue}</b>
            <span className="muted small">Overdue</span>
          </div>
        )}
        {total > 0 && (
          <div className="pill pill-total">
            <b>{Math.round((done / total) * 100)}%</b>
            <span className="muted small">Complete</span>
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ height: 6, background: "var(--border)", borderRadius: 999, marginBottom: 22, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${(done / total) * 100}%`,
            background: done === total ? "#16a34a" : "var(--brand)",
            borderRadius: 999,
            transition: "width 0.3s ease",
          }} />
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 18, alignItems: "start" }}>

        {/* ─ Calendar card ─────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 16, position: "sticky", top: 20 }}>

          {/* Month navigation — centered at top of calendar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
            <button className="btn" onClick={prevMonth} style={{ padding: "5px 12px", fontWeight: 900, fontSize: 14 }}>←</button>
            <span style={{ fontWeight: 800, fontSize: 14, minWidth: 120, textAlign: "center" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button className="btn" onClick={nextMonth} style={{ padding: "5px 12px", fontWeight: 900, fontSize: 14 }}>→</button>
            {!isCurrentMonth && (
              <button className="btn" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }} style={{ fontSize: 11, padding: "5px 9px" }}>
                Today
              </button>
            )}
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: "var(--muted)", padding: "2px 0", letterSpacing: "0.04em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const dayTasks = dayMap[day] ?? [];
              const hasTasks = dayTasks.length > 0;
              const sel = selDay === day;
              const tod = isToday(day);
              const past = isPast(day);
              const allDone = hasTasks && dayTasks.every(t => checked[t.id]);

              return (
                <div
                  key={day}
                  onClick={() => hasTasks && setSelDay(sel ? null : day)}
                  title={hasTasks ? `${dayTasks.length} task${dayTasks.length > 1 ? "s" : ""}` : undefined}
                  style={{
                    textAlign: "center",
                    padding: "5px 2px 4px",
                    borderRadius: 7,
                    cursor: hasTasks ? "pointer" : "default",
                    background: sel ? "var(--brand)" : tod ? "rgba(11,74,125,0.1)" : "transparent",
                    color: sel ? "#fff" : tod ? "var(--brand)" : past && !hasTasks ? "var(--muted)" : "var(--text)",
                    fontWeight: tod ? 800 : 400,
                    fontSize: 13,
                    border: tod && !sel ? "1.5px solid var(--brand)" : "1.5px solid transparent",
                    opacity: past && !hasTasks && !tod ? 0.4 : 1,
                    transition: "background 0.1s",
                  }}
                >
                  {day}
                  {hasTasks && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 2 }}>
                      {dayTasks.slice(0, 4).map(t => (
                        <div key={t.id} style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: allDone ? "#16a34a" : checked[t.id] ? "#16a34a" : CATEGORIES[t.category].dot,
                          opacity: checked[t.id] ? 0.45 : 1,
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <hr />

          {/* Category filter */}
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 8 }}>
            FILTER BY CATEGORY
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([key, cat]) => {
              if (key === "daily") return null; // daily is always pinned, not filterable
              const count = tasks.filter(t => t.category === key).length;
              if (count === 0) return null;
              const active = filterCat === key;
              const catDone = tasks.filter(t => t.category === key && checked[t.id]).length;
              return (
                <button
                  key={key}
                  onClick={() => setFilterCat(active ? "all" : key)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 8, width: "100%",
                    background: active ? cat.bg : "transparent",
                    border: `1px solid ${active ? cat.border : "transparent"}`,
                    borderRadius: 6, padding: "5px 8px",
                    cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? cat.text : "var(--text)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.dot, display: "inline-block", flexShrink: 0 }} />
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 11, color: active ? cat.text : "var(--muted)", fontWeight: 700 }}>
                    {catDone}/{count}
                  </span>
                </button>
              );
            })}
          </div>

          {(selDay !== null || filterCat !== "all") && (
            <button
              className="btn"
              onClick={() => { setSelDay(null); setFilterCat("all"); }}
              style={{ width: "100%", marginTop: 10, fontSize: 12 }}
            >
              Clear filter
            </button>
          )}
        </div>

        {/* ─ Checklist ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Active filter label */}
          {(selDay !== null || filterCat !== "all") && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
              {selDay !== null
                ? `Tasks due ${MONTHS[viewMonth]} ${selDay}${filterCat !== "all" ? ` · ${CATEGORIES[filterCat].label}` : ""}`
                : `Filtered: ${CATEGORIES[filterCat as Category].label}`}
            </div>
          )}

          {/* Flat task list — one card, frequency pill per row */}
          {(pinnedTasks.length > 0 || sortedVisible.length > 0) && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>

              {/* Pinned daily reminders — always at top, no checkbox */}
              {pinnedTasks.map((task, idx) => {
                const catDef = CATEGORIES[task.category];
                const isLast = idx === pinnedTasks.length - 1 && sortedVisible.length === 0;
                return (
                  <div
                    key={task.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--border)",
                      background: catDef.bg,
                    }}
                  >
                    {/* Greyed checkbox — decorative only, for alignment */}
                    <input
                      type="checkbox"
                      disabled
                      style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.25, cursor: "default" }}
                    />
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                      color: catDef.text, background: "var(--card)",
                      border: `1px solid ${catDef.border}`,
                      padding: "2px 6px", borderRadius: 999, flexShrink: 0,
                    }}>
                      {catDef.pill}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: catDef.text }}>
                          {task.label}
                        </span>
                        {task.link && (
                          <a
                            href={task.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 11, fontWeight: 700,
                              color: catDef.text, background: "var(--card)",
                              border: `1px solid ${catDef.border}`,
                              borderRadius: 5, padding: "2px 7px",
                              textDecoration: "none", flexShrink: 0,
                            }}
                          >
                            Open →
                          </a>
                        )}
                      </div>
                      {task.notes && (
                        <div style={{ fontSize: 12, color: catDef.text, opacity: 0.7, marginTop: 2 }}>{task.notes}</div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: catDef.text, background: "var(--card)",
                      border: `1px solid ${catDef.border}`,
                      padding: "3px 9px", borderRadius: 999,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      Daily reminder
                    </span>
                  </div>
                );
              })}

              {/* Regular task rows */}
              {sortedVisible.map((task, idx) => {
                const catDef  = CATEGORIES[task.category];
                const status  = taskStatus(task);
                const isDone  = !!checked[task.id];
                const isOver  = isCurrentMonth && !isDone && isPast(effDay(task, viewYear, viewMonth));
                const hasDetail = !!task.instructions;

                return (
                  <div
                    key={task.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "13px 16px",
                      borderBottom: idx < sortedVisible.length - 1 ? "1px solid var(--border)" : "none",
                      background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggle(task.id)}
                      style={{ marginTop: 3, width: 16, height: 16, accentColor: catDef.dot, flexShrink: 0, cursor: "pointer" }}
                    />

                    {/* Frequency pill */}
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                      color: catDef.text, background: catDef.bg,
                      border: `1px solid ${catDef.border}`,
                      padding: "2px 6px", borderRadius: 999,
                      flexShrink: 0, marginTop: 2,
                      opacity: isDone ? 0.45 : 1,
                    }}>
                      {task.pillOverride ?? catDef.pill}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          onClick={() => hasDetail && setDetailTask(task)}
                          title={hasDetail ? "Click for instructions" : undefined}
                          style={{
                            fontWeight: 600, fontSize: 14,
                            color: isDone ? "var(--muted)" : "var(--text)",
                            textDecoration: isDone ? "line-through" : "none",
                            cursor: hasDetail ? "pointer" : "default",
                          }}
                        >
                          {task.label}
                          {hasDetail && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 16, height: 16, borderRadius: "50%",
                              background: catDef.bg, border: `1px solid ${catDef.border}`,
                              color: catDef.text, fontSize: 10, fontWeight: 800,
                              marginLeft: 6, verticalAlign: "middle",
                              flexShrink: 0,
                            }}>i</span>
                          )}
                        </span>
                        {task.link && (
                          <Link
                            href={task.link}
                            title={`Open ${task.label}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 11, fontWeight: 700,
                              color: catDef.text, background: catDef.bg,
                              border: `1px solid ${catDef.border}`,
                              borderRadius: 5, padding: "2px 7px",
                              textDecoration: "none", flexShrink: 0,
                              opacity: isDone ? 0.5 : 1,
                            }}
                          >
                            Open →
                          </Link>
                        )}
                      </div>
                      {task.notes && (
                        <div className="muted small" style={{ marginTop: 3 }}>{task.notes}</div>
                      )}
                    </div>

                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: status.color, background: status.bg,
                      border: `1px solid ${status.border}`,
                      padding: "3px 9px", borderRadius: 999,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tax filings due this month ──────────────────────────────── */}
          {taxTasksThisMonth.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Section header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px",
                background: "rgba(11,74,125,0.05)",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                    color: TAX_CATEGORIES.ret.text, background: TAX_CATEGORIES.ret.bg,
                    border: `1px solid ${TAX_CATEGORIES.ret.border}`,
                    padding: "2px 6px", borderRadius: 999,
                  }}>TAX</span>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>Tax Filings Due This Month</span>
                </div>
                <Link
                  href="/tracker/taxes"
                  style={{
                    fontSize: 11, fontWeight: 700,
                    color: "var(--brand)", background: "rgba(11,74,125,0.07)",
                    border: "1px solid rgba(11,74,125,0.18)",
                    borderRadius: 5, padding: "3px 9px",
                    textDecoration: "none",
                  }}
                >
                  View all →
                </Link>
              </div>

              {/* One row per tax task */}
              {taxTasksThisMonth.map((task, idx) => {
                const cat     = TAX_CATEGORIES[task.category];
                const isDone  = isTaskEffectivelyDone(task, taxChecked);
                const dueDate = new Date(viewYear, task.dueMonth - 1, task.dueDay);
                dueDate.setHours(23, 59, 59);
                const isOver  = !isDone && isCurrentMonth && dueDate < today;
                const isToday = task.dueDay === today.getDate() && isCurrentMonth;
                const isSoon  = !isOver && !isToday && isCurrentMonth &&
                  (dueDate.getTime() - today.getTime()) <= 3 * 24 * 60 * 60 * 1000 &&
                  dueDate.getTime() > today.getTime();

                const dateLabel = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][task.dueMonth - 1]} ${task.dueDay}`;
                const status = isDone
                  ? { label: "✓ Filed",                color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.2)"  }
                  : isOver
                  ? { label: `Overdue · ${dateLabel}`, color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" }
                  : isToday
                  ? { label: "Due today",               color: "#ea580c", bg: "rgba(234,88,12,0.08)", border: "rgba(234,88,12,0.2)" }
                  : isSoon
                  ? { label: `Due soon · ${dateLabel}`,color: "#d97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)"  }
                  : { label: dateLabel,                  color: "var(--muted)", bg: "rgba(0,0,0,0.04)", border: "var(--border)" };

                // K-1 toggle: check/uncheck all investors at once
                const handleToggle = () => {
                  if (task.investors && task.investors.length > 0) {
                    setTaxChecked(prev => {
                      const next = { ...prev };
                      task.investors!.forEach(inv => { next[inv.id] = !isDone; });
                      saveTaxChecked(viewYear, next);
                      return next;
                    });
                  } else {
                    toggleTax(task.id);
                  }
                };

                // Investor progress for K-1
                const invCount = task.investors?.length ?? 0;
                const invDone  = task.investors?.filter(inv => taxChecked[inv.id]).length ?? 0;

                return (
                  <div
                    key={task.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "11px 16px",
                      borderBottom: idx < taxTasksThisMonth.length - 1 ? "1px solid var(--border)" : "none",
                      background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={handleToggle}
                      style={{ marginTop: 3, width: 16, height: 16, accentColor: cat.dot, flexShrink: 0, cursor: "pointer" }}
                    />
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                      color: cat.text, background: cat.bg,
                      border: `1px solid ${cat.border}`,
                      padding: "2px 6px", borderRadius: 999,
                      flexShrink: 0, marginTop: 2,
                      opacity: isDone ? 0.45 : 1,
                    }}>
                      {task.pillOverride ?? cat.pill}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontWeight: 600, fontSize: 14,
                        color: isDone ? "var(--muted)" : "var(--text)",
                        textDecoration: isDone ? "line-through" : "none",
                      }}>
                        {masterTrackerLabel(task)}
                      </span>
                      {invCount > 0 && (
                        <div className="muted small" style={{ marginTop: 3 }}>
                          {invDone}/{invCount} investors · <a href="/tracker/taxes" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 600 }}>manage →</a>
                        </div>
                      )}
                      {task.notes && !invCount && (
                        <div className="muted small" style={{ marginTop: 3 }}>{task.notes}</div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: status.color, background: status.bg,
                      border: `1px solid ${status.border}`,
                      padding: "3px 9px", borderRadius: 999,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state — only when no regular tasks match (pinned always shows) */}
          {sortedVisible.length === 0 && total === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {total === 0 ? "No tasks this month" : "No tasks match the current filter"}
              </div>
              <div className="muted small">
                {total === 0
                  ? `Nothing scheduled for ${MONTHS[viewMonth]} ${viewYear}`
                  : "Try clearing the filter to see all tasks"}
              </div>
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* ── Marie's recurring tasks (frequency-bucketed) ───────────────── */}
      {showStacie && (
        <div className="card" style={{ marginTop: ownerFilter === "both" ? 18 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <b style={{ fontSize: 17 }}>
              {ownerFilter === "both" ? "Marie's Recurring Tasks" : "Recurring Tasks"}
            </b>
            {ownerFilter === "both" && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                color: "#0b4a7d", background: "rgba(11,74,125,0.08)",
                border: "1px solid rgba(11,74,125,0.25)",
                padding: "3px 9px", borderRadius: 999,
              }}>MARIE</span>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>
            Checkboxes auto-reset each new period (week, month, quarter, etc.). State syncs across devices.
          </p>

          {stacieLoading ? (
            <div className="muted small" style={{ marginTop: 12 }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              {FREQUENCY_ORDER.map((freq) => {
                const tasks = stacieByFreq[freq];
                if (!tasks.length) return null;
                const { total: stTotal, done: stDone } = freqCount(freq);
                const open = openFreqs[freq];
                return (
                  <div key={freq} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={() => toggleFreq(freq)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        width: "100%", padding: "14px 16px",
                        background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 700 }}>{FREQUENCY_LABELS[freq]}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
                          ({stDone}/{stTotal})
                        </span>
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
                    </button>

                    {open && (
                      <div style={{ borderTop: "1px solid var(--border)" }}>
                        {tasks.map((t, i) => {
                          const isDone = isStacieChecked(t.id, freq);
                          const progress = t.bankRecProgress ? bankProgress(t.bankRecProgress) : null;
                          const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
                          const progressColor = t.bankRecProgress === "reconciled" ? "#16a34a" : "#0b4a7d";
                          return (
                            <label
                              key={t.id}
                              htmlFor={`stacie-task-${t.id}`}
                              style={{
                                display: "grid", gridTemplateColumns: "32px 1fr", gap: 12,
                                padding: "12px 16px",
                                borderTop: i === 0 ? undefined : "1px solid var(--border)",
                                cursor: "pointer",
                                alignItems: "start",
                              }}
                            >
                              <input
                                id={`stacie-task-${t.id}`}
                                type="checkbox"
                                checked={isDone}
                                onChange={() => toggleStacieTask(t.id, freq)}
                                style={{ width: 20, height: 20, marginTop: 2, cursor: "pointer" }}
                              />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  {t.detail ? (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); setDetailTask({ label: t.title, instructions: t.detail }); }}
                                      style={{
                                        fontSize: 14, fontWeight: 600, textAlign: "left",
                                        color: isDone ? "var(--muted)" : "var(--text)",
                                        textDecoration: isDone ? "line-through" : "none",
                                        background: "none", border: "none", padding: 0, cursor: "pointer",
                                        fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
                                      }}
                                    >
                                      <span style={{ borderBottom: "1px dotted var(--muted)" }}>{t.title}</span>
                                      <span style={{ fontSize: 12, color: "var(--brand)", fontWeight: 700 }}>ⓘ</span>
                                    </button>
                                  ) : (
                                    <span style={{
                                      fontSize: 14, fontWeight: 600,
                                      color: isDone ? "var(--muted)" : "var(--text)",
                                      textDecoration: isDone ? "line-through" : "none",
                                    }}>
                                      {t.title}
                                    </span>
                                  )}
                                  {t.link && (
                                    <Link
                                      href={t.link}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 3,
                                        fontSize: 11, fontWeight: 700,
                                        color: "var(--brand)", background: "rgba(11,74,125,0.08)",
                                        border: "1px solid rgba(11,74,125,0.22)",
                                        borderRadius: 5, padding: "2px 8px",
                                        textDecoration: "none", flexShrink: 0,
                                      }}
                                    >
                                      Open →
                                    </Link>
                                  )}
                                </div>
                                {t.instructions && (
                                  <div className="muted small" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                                    {t.instructions}
                                  </div>
                                )}
                                {progress && (
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                                      <span style={{ fontWeight: 600 }}>
                                        {progress.done}/{progress.total} {t.bankRecProgress === "reconciled" ? "reconciled" : "downloaded"}
                                      </span>
                                      <span style={{ fontWeight: 700, color: progressColor }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: 5, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                                      <div style={{
                                        height: "100%", borderRadius: 999,
                                        width: `${pct}%`,
                                        background: progress.done === progress.total ? "#16a34a" : progressColor,
                                        transition: "width 0.3s ease",
                                      }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {detailTask?.instructions && (() => {
        const instr = detailTask.instructions!;
        return (
          <div
            onClick={() => setDetailTask(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "var(--card)", borderRadius: 14,
                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                width: "100%", maxWidth: 720,
                maxHeight: "80vh", overflowY: "auto",
                display: "flex", flexDirection: "column",
              }}
            >
              {/* Modal header */}
              <div style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--border)",
                position: "sticky", top: 0, background: "var(--card)", zIndex: 1,
              }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-0.02em" }}>
                    {detailTask.label}
                  </div>
                  {instr.intro && (
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
                      {instr.intro}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setDetailTask(null)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", fontSize: 22, lineHeight: 1,
                    padding: "0 0 0 16px", flexShrink: 0, fontWeight: 300,
                  }}
                >×</button>
              </div>

              {/* Steps */}
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
                {instr.steps.map((step, si) => (
                  <div key={si}>
                    {/* Step header */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: "50%",
                        background: "var(--brand)", color: "#fff",
                        fontSize: 12, fontWeight: 800, flexShrink: 0,
                      }}>
                        {si + 1}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>{step.title}</span>
                    </div>

                    {/* Navigation path */}
                    {step.path && (
                      <div style={{
                        display: "inline-flex", alignItems: "center",
                        fontSize: 12, fontWeight: 700,
                        color: "var(--brand)",
                        background: "rgba(11,74,125,0.07)",
                        border: "1px solid rgba(11,74,125,0.18)",
                        borderRadius: 6, padding: "5px 10px",
                        marginBottom: 10, gap: 4,
                        fontFamily: "monospace",
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        {step.path}
                      </div>
                    )}

                    {/* Bullet items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 8 }}>
                      {step.items.map((item, ii) => (
                        <div key={ii} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                          <span style={{ color: "var(--brand)", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>·</span>
                          <span style={{ color: "var(--text)", lineHeight: 1.5 }}>{item}</span>
                        </div>
                      ))}
                    </div>

                    {/* Quick-access links (bank logins, etc.) */}
                    {step.links && step.links.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, paddingLeft: 8 }}>
                        {step.links.map((lk) => (
                          <a
                            key={lk.url + lk.label}
                            href={lk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              fontSize: 12, fontWeight: 700,
                              color: "var(--brand)",
                              background: "rgba(11,74,125,0.07)",
                              border: "1px solid rgba(11,74,125,0.25)",
                              borderRadius: 6, padding: "5px 10px",
                              textDecoration: "none",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <line x1="3" y1="21" x2="21" y2="21" /><line x1="5" y1="21" x2="5" y2="10" /><line x1="19" y1="21" x2="19" y2="10" /><line x1="9" y1="21" x2="9" y2="14" /><line x1="15" y1="21" x2="15" y2="14" /><polygon points="12 2 21 9 3 9" />
                            </svg>
                            {lk.label} →
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Asterisk note */}
                    {step.note && (
                      <div style={{
                        marginTop: 10, paddingLeft: 8,
                        fontSize: 12, fontStyle: "italic", color: "var(--muted)",
                        display: "flex", gap: 6,
                      }}>
                        <span style={{ fontWeight: 700, fontStyle: "normal" }}>*</span>
                        {step.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Modal footer */}
              <div style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex", justifyContent: "flex-end",
                position: "sticky", bottom: 0, background: "var(--card)",
              }}>
                <button
                  className="btn"
                  onClick={() => setDetailTask(null)}
                  style={{ padding: "8px 20px", fontWeight: 700 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
