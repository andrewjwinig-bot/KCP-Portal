"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, taskOccurrencesBetween, type TaskOccurrence } from "../../lib/tracker/taskDefs";

// Mirrors the tracker page's per-month localStorage key, so checking a task
// off here keeps it in sync with the Task Tracker on the same browser.
function monthKey(d: Date): string {
  return `tracker-v2-${d.getFullYear()}-${d.getMonth()}`;
}

/** Drew's master-tracker tasks due this calendar week, checkable in place. */
export default function DrewTasksThisWeek() {
  const occ = useMemo<TaskOccurrence[]>(() => {
    const now = new Date();
    const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → start week on Monday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
    return taskOccurrencesBetween(start, end);
  }, []);

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
  }, [occ]);

  function toggle(o: TaskOccurrence) {
    const k = monthKey(o.date);
    setChecked((prev) => {
      const monthMap = { ...(prev[k] ?? {}), [o.id]: !prev[k]?.[o.id] };
      try { localStorage.setItem(k, JSON.stringify(monthMap)); } catch { /* ignore */ }
      return { ...prev, [k]: monthMap };
    });
  }

  const todayKey = new Date().toDateString();
  const startOfToday = new Date(new Date().toDateString()).getTime();

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Tasks This Week
        </div>
        <Link href="/tracker" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
          Tracker →
        </Link>
      </div>
      {occ.length === 0 ? (
        <div className="muted small">No tracker tasks due this week.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {occ.map((o) => {
            const isToday = o.date.toDateString() === todayKey;
            const isPast = o.date.getTime() < startOfToday;
            const done = !!checked[monthKey(o.date)]?.[o.id];
            const dot = CATEGORIES[o.category]?.dot ?? "#64748b";
            return (
              <label
                key={o.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 8,
                  border: "1px solid",
                  borderColor: isToday ? "rgba(11,74,125,0.35)" : "rgba(15,23,42,0.12)",
                  background: done
                    ? "rgba(22,163,74,0.06)"
                    : isToday ? "rgba(11,74,125,0.06)" : "rgba(15,23,42,0.025)",
                  opacity: isPast && !done ? 0.7 : 1,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(o)}
                  style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                />
                <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flexShrink: 0 }} />
                <div style={{
                  flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600,
                  textDecoration: done ? "line-through" : undefined,
                  color: done ? "var(--muted)" : undefined,
                }}>
                  {o.label}
                </div>
                <div className="muted small" style={{ flexShrink: 0, fontWeight: isToday ? 700 : 400 }}>
                  {isToday
                    ? "Today"
                    : o.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
