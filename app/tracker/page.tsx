"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type Category = "routine" | "quarterly" | "seasonal";

const CATEGORIES: Record<Category, { label: string; dot: string; bg: string; text: string; border: string }> = {
  routine:   { label: "Monthly Routine",    dot: "#0b4a7d", bg: "rgba(11,74,125,0.08)",  text: "#0b4a7d", border: "rgba(11,74,125,0.25)"  },
  quarterly: { label: "Quarterly",          dot: "#6d28d9", bg: "rgba(109,40,217,0.08)", text: "#6d28d9", border: "rgba(109,40,217,0.25)" },
  seasonal:  { label: "Seasonal / Annual",  dot: "#b45309", bg: "rgba(180,83,9,0.08)",   text: "#b45309", border: "rgba(180,83,9,0.25)"   },
};

// ─── TASK DEFINITIONS ───────────────────────────────────────────────────────
//
// dueDay:     calendar day (1–31). For end-of-month tasks set endOfMonth: true.
// endOfMonth: task is due at the end of the month (last calendar day).
// lastFriday: task is due on the last Friday of the month (computed per month).
// approxDay:  display as "~Xth" (e.g. Close Prior Month ~20th).
// months:     which months this task applies (1=Jan … 12=Dec). Omit = every month.
// link:       internal route to open when the task label arrow is clicked.

interface TaskDef {
  id: string;
  label: string;
  category: Category;
  dueDay: number;
  endOfMonth?: boolean;
  lastFriday?: boolean;
  approxDay?: boolean;
  months?: number[];
  notes?: string;
  link?: string;
}

const TASK_DEFS: TaskDef[] = [

  // ── MONTHLY ROUTINE — appears every month ─────────────────────────────────
  {
    id: "m-checks",
    label: "1st of the Month Checks",
    category: "routine",
    dueDay: 1,
    notes: "Print checks and cover sheet",
  },
  {
    id: "m-lbr",
    label: "Liberty Bank Report",
    category: "routine",
    dueDay: 15,
    notes: "Reprojections",
  },
  {
    id: "m-lhsc",
    label: "LHSC Cushman Report",
    category: "routine",
    dueDay: 15,
    notes: "Activity Rec, Cash Journal, Check Register, Voucher Report, Bank Statement",
  },
  {
    id: "m-close",
    label: "Close Prior Month",
    category: "routine",
    dueDay: 20,
    approxDay: true,
  },
  {
    id: "m-cash",
    label: "Cash Analysis Report",
    category: "routine",
    dueDay: 20,
  },
  {
    id: "m-opstmt",
    label: "Operating Statements",
    category: "routine",
    dueDay: 20,
  },
  {
    id: "m-tenant",
    label: "Tenant Group Setup",
    category: "routine",
    dueDay: 31,
    endOfMonth: true,
  },
  {
    id: "m-mgmt-fees",
    label: "Print Management Fees",
    category: "routine",
    dueDay: 0,
    lastFriday: true,
  },
  {
    id: "m-alloc-exp",
    label: "Allocate Expenses",
    category: "routine",
    dueDay: 20,
    approxDay: true,
    notes: "Same time as monthly close",
    link: "/allocated-invoicer",
  },
  {
    id: "m-alloc-cc",
    label: "Allocate CC Charges",
    category: "routine",
    dueDay: 20,
    approxDay: true,
    notes: "Same time as monthly close",
    link: "/expenses",
  },

  // ── QUARTERLY — January, April, July, October ─────────────────────────────
  {
    id: "q-bp",
    label: "BP Commissions",
    category: "quarterly",
    dueDay: 31,
    endOfMonth: true,
    months: [1, 4, 7, 10],
    notes: "Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct)",
  },
  {
    id: "q-lhscwawa",
    label: "LHSC Wawa Quarterly CAM",
    category: "quarterly",
    dueDay: 31,
    endOfMonth: true,
    months: [1, 4, 7, 10],
    notes: "Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct)",
  },

  // ── SEASONAL / ANNUAL — specific months only ──────────────────────────────

  // January
  {
    id: "jan-1099due",
    label: "1099 Due",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [1],
    notes: "Track 1099 files for us",
  },
  {
    id: "jan-alloc",
    label: "Reconcile Allocated Expenses",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [1],
    notes: "9301, 9302, 9303 expenses in 2000 account",
  },

  // February
  {
    id: "feb-wp",
    label: "Start Workpapers",
    category: "seasonal",
    dueDay: 1,
    months: [2],
    notes: "Once January is closed",
  },

  // March
  {
    id: "mar-wak",
    label: "Wakefern CAM Rec Due",
    category: "seasonal",
    dueDay: 30,
    months: [3],
  },
  {
    id: "mar-ret",
    label: "Single-Tenant RET Bills",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [3],
    notes: "Add RET bills to their charges. Include copy of actual RET bill",
  },

  // April
  {
    id: "apr-cam",
    label: "CAM Recs Due",
    category: "seasonal",
    dueDay: 30,
    months: [4],
  },

  // July
  {
    id: "jul-sky",
    label: "Reprojection Skyline Upload",
    category: "seasonal",
    dueDay: 1,
    months: [7],
  },

  // August
  {
    id: "aug-ins",
    label: "Insurance Applications",
    category: "seasonal",
    dueDay: 1,
    months: [8],
  },

  // September
  {
    id: "sep-bud",
    label: "Next Year Budgets",
    category: "seasonal",
    dueDay: 1,
    months: [9],
    notes: "Begin budget discussions for next year",
  },

  // October
  {
    id: "oct-wak",
    label: "Wakefern Budget Due",
    category: "seasonal",
    dueDay: 1,
    months: [10],
    notes: "Must be sent by this date",
  },

  // November
  {
    id: "nov-chase",
    label: "Check Chase — Black Friday",
    category: "seasonal",
    dueDay: 28,
    months: [11],
    notes: "Bank is open. Check to approve checks due that day",
  },
  {
    id: "nov-camest",
    label: "Upload CAM Estimates",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [11],
    notes: "Once December charges post, end current recurring charges and upload new ones",
  },
  {
    id: "nov-budsky",
    label: "Upload Budgets to Skyline",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [11],
    notes: "Do not upload P properties — upload individual buildings and consolidate",
  },
  {
    id: "nov-rec",
    label: "1st of Month Reconciliation",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [11],
  },

  // December
  {
    id: "dec-1099",
    label: "1099 Start",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [12],
    notes: "Prepare the vendor list and upload to track1099.com",
  },
  {
    id: "dec-int",
    label: "Transfer Interest Income",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [12],
    notes: "From three security deposit accounts. Calculate management fees on interest",
  },
  {
    id: "dec-bank",
    label: "Reimburse Bank Fees",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [12],
    notes: "Office Works and Eastwick (unless M&T acc closes)",
  },
];

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

function daysInMonth(year: number, month: number) {   // month 0-indexed
  return new Date(year, month + 1, 0).getDate();
}
function firstDOW(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function tasksForMonth(year: number, month: number): TaskDef[] { // month 0-indexed
  const m = month + 1;
  return TASK_DEFS.filter(t => !t.months || t.months.includes(m));
}

// Last Friday of a given month (0-indexed)
function lastFridayOfMonth(year: number, month: number): number {
  const last = daysInMonth(year, month);
  for (let d = last; d >= last - 6; d--) {
    if (new Date(year, month, d).getDay() === 5) return d;
  }
  return last;
}

// Resolve computed due day (handles endOfMonth and lastFriday)
function effDay(t: TaskDef, year: number, month: number): number {
  if (t.endOfMonth) return daysInMonth(year, month);
  if (t.lastFriday) return lastFridayOfMonth(year, month);
  return t.dueDay;
}

// Human-readable due date label for status badge
function dueName(t: TaskDef, year: number, monthIdx: number): string {
  if (t.endOfMonth) return "End of Month";
  if (t.lastFriday) {
    const d = lastFridayOfMonth(year, monthIdx);
    return `Last Fri (${MONTHS[monthIdx].slice(0, 3)} ${d})`;
  }
  if (t.approxDay)  return `~${t.dueDay}th`;
  return `${MONTHS[monthIdx].slice(0, 3)} ${t.dueDay}`;
}

// ─── PAGE ───────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const today = new Date();

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [checked,   setChecked]   = useState<Record<string, boolean>>({});
  const [selDay,    setSelDay]    = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<Category | "all">("all");

  useEffect(() => {
    setChecked(loadChecked(viewYear, viewMonth));
    setSelDay(null);
  }, [viewYear, viewMonth]);

  const tasks = useMemo(() => tasksForMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecked(viewYear, viewMonth, next);
      return next;
    });
  }, [viewYear, viewMonth]);

  // Tasks grouped by their effective calendar day (for dots)
  const dayMap = useMemo(() => {
    const m: Record<number, TaskDef[]> = {};
    tasks.forEach(t => {
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

  const grouped = useMemo(() => {
    const g: Partial<Record<Category, TaskDef[]>> = {};
    visible.forEach(t => { (g[t.category] ??= []).push(t); });
    return g;
  }, [visible]);

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
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Master Tracker
          </h1>
          <p className="muted small">Monthly to-do checklist · filing deadlines · recurring tasks</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn" onClick={prevMonth} style={{ padding: "8px 16px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 16, minWidth: 170, textAlign: "center" }}>
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button className="btn" onClick={nextMonth} style={{ padding: "8px 16px", fontWeight: 900 }}>→</button>
          {!isCurrentMonth && (
            <button className="btn" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }} style={{ fontSize: 13 }}>
              Today
            </button>
          )}
        </div>
      </div>

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
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
            {MONTHS[viewMonth]} {viewYear}
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

          {/* Grouped task cards */}
          {(Object.keys(CATEGORIES) as Category[])
            .filter(cat => (grouped[cat]?.length ?? 0) > 0)
            .map(cat => {
              const catDef   = CATEGORIES[cat];
              const catTasks = (grouped[cat] ?? []).slice().sort((a, b) =>
                effDay(a, viewYear, viewMonth) - effDay(b, viewYear, viewMonth)
              );
              const catDone = catTasks.filter(t => checked[t.id]).length;

              return (
                <div key={cat} className="card" style={{ padding: 0, overflow: "hidden" }}>

                  {/* Category header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 16px",
                    background: catDef.bg,
                    borderBottom: `1px solid ${catDef.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: catDef.dot }} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: catDef.text }}>{catDef.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: catDef.text, opacity: 0.75 }}>
                      {catDone}/{catTasks.length} done
                    </span>
                  </div>

                  {/* Task rows */}
                  {catTasks.map((task, idx) => {
                    const status = taskStatus(task);
                    const isDone = !!checked[task.id];
                    const isOver = isCurrentMonth && !isDone && isPast(effDay(task, viewYear, viewMonth));

                    return (
                      <div
                        key={task.id}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 12,
                          padding: "13px 16px",
                          borderBottom: idx < catTasks.length - 1 ? "1px solid var(--border)" : "none",
                          background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() => toggle(task.id)}
                          style={{ marginTop: 2, width: 16, height: 16, accentColor: catDef.dot, flexShrink: 0, cursor: "pointer" }}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              fontWeight: 600, fontSize: 14,
                              color: isDone ? "var(--muted)" : "var(--text)",
                              textDecoration: isDone ? "line-through" : "none",
                            }}>
                              {task.label}
                            </span>
                            {task.link && (
                              <Link
                                href={task.link}
                                title={`Open ${task.label}`}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                  fontSize: 11, fontWeight: 700,
                                  color: catDef.text,
                                  background: catDef.bg,
                                  border: `1px solid ${catDef.border}`,
                                  borderRadius: 5, padding: "2px 7px",
                                  textDecoration: "none",
                                  flexShrink: 0,
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
                          color: status.color,
                          background: status.bg,
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
              );
            })}

          {/* Empty state */}
          {visible.length === 0 && (
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
    </main>
  );
}
