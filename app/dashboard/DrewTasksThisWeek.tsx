"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CATEGORIES, taskOccurrencesBetween } from "../../lib/tracker/taskDefs";

/** Drew's master-tracker tasks falling due in the current calendar week. */
export default function DrewTasksThisWeek() {
  const occ = useMemo(() => {
    const now = new Date();
    const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → start week on Monday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
    return taskOccurrencesBetween(start, end);
  }, []);

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
            const dot = CATEGORIES[o.category]?.dot ?? "#64748b";
            return (
              <div
                key={o.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 8,
                  border: "1px solid",
                  borderColor: isToday ? "rgba(11,74,125,0.35)" : "rgba(15,23,42,0.12)",
                  background: isToday ? "rgba(11,74,125,0.06)" : "rgba(15,23,42,0.025)",
                  opacity: isPast ? 0.55 : 1,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                <div className="muted small" style={{ flexShrink: 0, fontWeight: isToday ? 700 : 400 }}>
                  {isToday
                    ? "Today"
                    : o.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
