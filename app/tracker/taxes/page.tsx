"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TAX_TASKS, TAX_CATEGORIES, TaxCategory,
  PARCEL_INFO,
  loadTaxChecked, saveTaxChecked,
  baseEntityName, filingLabel, isTaskEffectivelyDone,
} from "../tax-data";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── HELPERS ────────────────────────────────────────────────────────────────

function isPastDate(year: number, month: number, day: number, today: Date) {
  const dt = new Date(year, month - 1, day);
  dt.setHours(23, 59, 59);
  return dt < today;
}
function isTodayDate(year: number, month: number, day: number, today: Date) {
  return month === today.getMonth() + 1 && day === today.getDate() && year === today.getFullYear();
}
function isSoonDate(year: number, month: number, day: number, today: Date) {
  const dt = new Date(year, month - 1, day);
  const ms = dt.getTime() - today.getTime();
  return ms > 0 && ms <= 3 * 24 * 60 * 60 * 1000;
}

// ─── PAGE ───────────────────────────────────────────────────────────────────

export default function TaxTrackerPage() {
  const today = new Date();
  const [viewYear,    setViewYear]    = useState(today.getFullYear());
  const [checked,     setChecked]     = useState<Record<string, boolean>>({});
  const [filterCat,   setFilterCat]   = useState<TaxCategory | "all">("all");
  const [filterMonth, setFilterMonth] = useState<number | "all">("all");
  const [expandedK1,  setExpandedK1]  = useState<Set<string>>(new Set());

  useEffect(() => { setChecked(loadTaxChecked(viewYear)); }, [viewYear]);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveTaxChecked(viewYear, next);
      return next;
    });
  }, [viewYear]);

  const visible = useMemo(() =>
    TAX_TASKS.filter(t => {
      if (filterCat   !== "all" && t.category !== filterCat)   return false;
      if (filterMonth !== "all" && t.dueMonth !== filterMonth) return false;
      return true;
    }),
    [filterCat, filterMonth]
  );

  // Build flat property → tasks map (preserving data-defined entity order)
  const byProperty = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, typeof TAX_TASKS> = {};
    visible.forEach(t => {
      const base = baseEntityName(t.entity);
      if (!map[base]) { map[base] = []; order.push(base); }
      map[base].push(t);
    });
    order.forEach(prop => {
      map[prop].sort((a, b) =>
        a.dueMonth !== b.dueMonth ? a.dueMonth - b.dueMonth : a.dueDay - b.dueDay
      );
    });
    return { order, map };
  }, [visible]);

  // Toggle all investors for a K-1 task (or single task otherwise)
  const toggleK1All = useCallback((task: typeof TAX_TASKS[number]) => {
    if (!task.investors) { toggle(task.id); return; }
    const allDone = task.investors.every(inv => checked[inv.id]);
    setChecked(prev => {
      const next = { ...prev };
      task.investors!.forEach(inv => { next[inv.id] = !allDone; });
      saveTaxChecked(viewYear, next);
      return next;
    });
  }, [checked, viewYear, toggle]);

  // Stats
  const total   = TAX_TASKS.length;
  const done    = TAX_TASKS.filter(t => isTaskEffectivelyDone(t, checked)).length;
  const overdue = TAX_TASKS.filter(t => !isTaskEffectivelyDone(t, checked) && isPastDate(viewYear, t.dueMonth, t.dueDay, today)).length;

  // Months that have tasks (for quick filter pills)
  const activeMonths = useMemo(() => {
    const ms = new Set<number>();
    TAX_TASKS.forEach(t => {
      if (filterCat === "all" || t.category === filterCat) ms.add(t.dueMonth);
    });
    return Array.from(ms).sort((a, b) => a - b);
  }, [filterCat]);

  function statusFor(t: typeof TAX_TASKS[number], done?: boolean) {
    if (done === undefined) done = isTaskEffectivelyDone(t, checked);
    const dateStr = `${MONTH_NAMES[t.dueMonth - 1]} ${t.dueDay}`;
    if (done)
      return { label: "✓ Filed",                color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.2)"  };
    if (isPastDate(viewYear, t.dueMonth, t.dueDay, today))
      return { label: `Overdue · ${dateStr}`,   color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" };
    if (isTodayDate(viewYear, t.dueMonth, t.dueDay, today))
      return { label: "Due today",               color: "#ea580c", bg: "rgba(234,88,12,0.08)", border: "rgba(234,88,12,0.2)" };
    if (isSoonDate(viewYear, t.dueMonth, t.dueDay, today))
      return { label: `Due soon · ${dateStr}`,  color: "#d97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)"  };
    return {
      label: dateStr,
      color: "var(--muted)", bg: "rgba(0,0,0,0.04)", border: "var(--border)",
    };
  }

  return (
    <main>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Filing Tracker
          </h1>
          <p className="muted small">County &amp; school RE taxes · net profits / BIRT · entity filings</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </div>

      {/* ── Summary pills ────────────────────────────────────────────────── */}
      <div className="pills" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
        <div className="pill">
          <b>{total}</b>
          <span className="muted small">Total filings</span>
        </div>
        <div className="pill" style={{ borderColor: "#16a34a", background: "rgba(22,163,74,0.06)" }}>
          <b style={{ color: "#16a34a" }}>{done}</b>
          <span className="muted small">Filed</span>
        </div>
        <div className="pill">
          <b>{total - done}</b>
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
            height: "100%", width: `${(done / total) * 100}%`,
            background: done === total ? "#16a34a" : "var(--brand)",
            borderRadius: 999, transition: "width 0.3s ease",
          }} />
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 22, alignItems: "flex-start" }}>

        {/* Year nav */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 7 }}>YEAR</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="btn" onClick={() => setViewYear(y => y - 1)} style={{ padding: "5px 11px", fontWeight: 900 }}>←</button>
            <span style={{ fontWeight: 800, fontSize: 14, minWidth: 42, textAlign: "center" }}>{viewYear}</span>
            <button className="btn" onClick={() => setViewYear(y => y + 1)} style={{ padding: "5px 11px", fontWeight: 900 }}>→</button>
            {viewYear !== today.getFullYear() && (
              <button className="btn" onClick={() => setViewYear(today.getFullYear())} style={{ fontSize: 12, padding: "5px 10px" }}>
                This Year
              </button>
            )}
          </div>
        </div>

        {/* Category filter */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 7 }}>TYPE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.entries(TAX_CATEGORIES) as [TaxCategory, typeof TAX_CATEGORIES[TaxCategory]][]).map(([key, cat]) => {
              const active  = filterCat === key;
              const count   = TAX_TASKS.filter(t => t.category === key).length;
              const catDone = TAX_TASKS.filter(t => t.category === key && checked[t.id]).length;
              return (
                <button key={key} onClick={() => setFilterCat(active ? "all" : key)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 11px",
                  border: `1px solid ${active ? cat.border : "var(--border)"}`,
                  borderRadius: 999, cursor: "pointer",
                  background: active ? cat.bg : "#fff",
                  fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? cat.text : "var(--text)",
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                    color: active ? cat.text : "#fff",
                    background: active ? "#fff" : cat.dot,
                    border: `1px solid ${cat.border}`,
                    padding: "1px 5px", borderRadius: 999,
                  }}>{cat.pill}</span>
                  {cat.label}
                  <span style={{ fontSize: 11, color: active ? cat.text : "var(--muted)", opacity: 0.8 }}>
                    {catDone}/{count}
                  </span>
                </button>
              );
            })}
            {filterCat !== "all" && (
              <button className="btn" onClick={() => setFilterCat("all")} style={{ fontSize: 12, padding: "5px 11px" }}>Clear</button>
            )}
          </div>
        </div>

        {/* Month filter */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 7 }}>MONTH</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {activeMonths.map(m => {
              const active = filterMonth === m;
              return (
                <button key={m} onClick={() => setFilterMonth(active ? "all" : m)} style={{
                  padding: "5px 11px",
                  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                  borderRadius: 999, cursor: "pointer",
                  background: active ? "rgba(11,74,125,0.08)" : "#fff",
                  fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? "var(--brand)" : "var(--text)",
                }}>
                  {MONTHS[m - 1]}
                </button>
              );
            })}
            {filterMonth !== "all" && (
              <button className="btn" onClick={() => setFilterMonth("all")} style={{ fontSize: 12, padding: "5px 11px" }}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* ── File path note ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", marginBottom: 16,
        background: "rgba(11,74,125,0.05)",
        border: "1px solid rgba(11,74,125,0.18)",
        borderRadius: 8,
        fontSize: 12,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b4a7d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span style={{ color: "#0b4a7d", fontWeight: 600 }}>RET bills are saved at:</span>
        <code style={{
          fontFamily: "monospace", fontWeight: 700, fontSize: 12,
          color: "#0b4a7d", background: "rgba(11,74,125,0.08)",
          border: "1px solid rgba(11,74,125,0.2)",
          borderRadius: 4, padding: "1px 7px",
          letterSpacing: "0.01em",
        }}>
          Data\Shared\Real Estate Tax
        </code>
      </div>

      {/* ── Flat property list ───────────────────────────────────────────── */}
      {byProperty.order.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No filings match the current filter</div>
          <div className="muted small">Try clearing the filters above</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {byProperty.order.map((propName, pi) => {
            const propTasks = byProperty.map[propName];
            const propDone  = propTasks.filter(t => isTaskEffectivelyDone(t, checked)).length;
            const allFiled  = propDone === propTasks.length;
            const isLast    = pi === byProperty.order.length - 1;

            return (
              <div key={propName} style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>

                {/* Property name row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 18px",
                  background: allFiled ? "rgba(22,163,74,0.04)" : "rgba(0,0,0,0.025)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{
                    fontWeight: 700, fontSize: 13,
                    color: allFiled ? "var(--muted)" : "var(--text)",
                    textDecoration: allFiled ? "line-through" : "none",
                  }}>
                    {propName}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                    {propDone}/{propTasks.length}
                  </span>
                </div>

                {/* Filing rows */}
                {propTasks.map((task, ti) => {
                  const cat    = TAX_CATEGORIES[task.category];
                  const isDone = isTaskEffectivelyDone(task, checked);
                  const status = statusFor(task, isDone);
                  const isOver = !isDone && isPastDate(viewYear, task.dueMonth, task.dueDay, today);
                  const isLast = ti === propTasks.length - 1;

                  // ── K-1 row (collapsible) ────────────────────────────────
                  if (task.category === "k1" && task.investors) {
                    const investors    = task.investors;
                    const invDone      = investors.filter(inv => checked[inv.id]).length;
                    const isExpanded   = expandedK1.has(task.id);
                    const toggleExpand = () => setExpandedK1(prev => {
                      const next = new Set(prev);
                      next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                      return next;
                    });

                    return (
                      <div key={task.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>

                        {/* K-1 header row */}
                        <div
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 18px 10px 34px",
                            background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                            cursor: "pointer",
                          }}
                          onClick={toggleExpand}
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleK1All(task)}
                            style={{ width: 15, height: 15, accentColor: cat.dot, flexShrink: 0, cursor: "pointer", marginTop: 0 }}
                          />
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                            color: cat.text, background: cat.bg,
                            border: `1px solid ${cat.border}`,
                            padding: "2px 6px", borderRadius: 999, flexShrink: 0,
                            opacity: isDone ? 0.5 : 1,
                          }}>
                            {cat.pill}
                          </span>
                          <span style={{
                            flex: 1, fontSize: 13, fontWeight: 500,
                            color: isDone ? "var(--muted)" : "var(--text)",
                            textDecoration: isDone ? "line-through" : "none",
                          }}>
                            {filingLabel(task)}
                          </span>
                          {/* Investor count badge */}
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: isDone ? "#16a34a" : "var(--muted)",
                            background: isDone ? "rgba(22,163,74,0.08)" : "rgba(0,0,0,0.04)",
                            border: `1px solid ${isDone ? "rgba(22,163,74,0.2)" : "var(--border)"}`,
                            padding: "2px 8px", borderRadius: 999,
                          }}>
                            {invDone}/{investors.length}
                          </span>
                          {/* Status badge */}
                          <span style={{
                            fontSize: 11, fontWeight: 800,
                            color: status.color, background: status.bg,
                            border: `1px solid ${status.border}`,
                            padding: "3px 9px", borderRadius: 999,
                            whiteSpace: "nowrap", flexShrink: 0,
                          }}>
                            {status.label}
                          </span>
                          {/* Chevron */}
                          <svg
                            width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{
                              color: "var(--muted)", flexShrink: 0,
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 0.15s",
                            }}
                          >
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </div>

                        {/* Investor sub-rows */}
                        {isExpanded && investors.map((inv, ii) => {
                          const invChecked = !!checked[inv.id];
                          return (
                            <div
                              key={inv.id}
                              style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "7px 18px 7px 58px",
                                borderTop: "1px solid var(--border)",
                                background: invChecked ? "rgba(22,163,74,0.02)" : "rgba(15,118,110,0.02)",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={invChecked}
                                onChange={() => {
                                  setChecked(prev => {
                                    const next = { ...prev, [inv.id]: !prev[inv.id] };
                                    saveTaxChecked(viewYear, next);
                                    return next;
                                  });
                                }}
                                style={{ width: 14, height: 14, accentColor: cat.dot, flexShrink: 0, cursor: "pointer" }}
                              />
                              <span style={{
                                fontSize: 12, fontWeight: 500,
                                color: invChecked ? "var(--muted)" : "var(--text)",
                                textDecoration: invChecked ? "line-through" : "none",
                              }}>
                                {inv.name}
                              </span>
                              {invChecked && (
                                <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700, marginLeft: "auto" }}>✓</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // ── Standard filing row ──────────────────────────────────
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "10px 18px 10px 34px",
                        borderBottom: isLast ? "none" : "1px solid var(--border)",
                        background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggle(task.id)}
                        style={{ width: 15, height: 15, accentColor: cat.dot, flexShrink: 0, cursor: "pointer", marginTop: 2 }}
                      />
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                        color: cat.text, background: cat.bg,
                        border: `1px solid ${cat.border}`,
                        padding: "2px 6px", borderRadius: 999, flexShrink: 0,
                        opacity: isDone ? 0.5 : 1, marginTop: 2,
                      }}>
                        {cat.pill}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: isDone ? "var(--muted)" : "var(--text)",
                          textDecoration: isDone ? "line-through" : "none",
                        }}>
                          {filingLabel(task)}
                        </span>
                        {task.category === "ret" && (() => {
                          const parcels = PARCEL_INFO[baseEntityName(task.entity)] ?? [];
                          if (parcels.length === 0) return null;
                          return (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                              {parcels.map((p, pi) => (
                                <span key={pi} style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  fontSize: 10, fontWeight: 600,
                                  color: "var(--muted)",
                                  background: "rgba(0,0,0,0.04)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 4, padding: "2px 7px",
                                  fontFamily: "monospace",
                                  opacity: isDone ? 0.5 : 1,
                                }}>
                                  {p.method && (
                                    <span style={{
                                      fontFamily: "inherit", fontWeight: 700,
                                      color: p.method === "Liberty Bank" ? "#0d6b4e"
                                           : p.method === "Check"        ? "#b45309"
                                           : "#0b4a7d",
                                    }}>
                                      {p.method} ·
                                    </span>
                                  )}
                                  {p.number}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                        {task.notes && (
                          <div className="muted small" style={{ marginTop: 2 }}>{task.notes}</div>
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
            );
          })}
        </div>
      )}
    </main>
  );
}
