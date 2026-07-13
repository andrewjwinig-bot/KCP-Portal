"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, taskOccurrencesBetween, type TaskOccurrence } from "../../lib/tracker/taskDefs";
import { importsForWeek, reminderSatisfied, type ImportReminder, type ImportEvent } from "../../lib/tracker/imports";
import MyTasks from "../components/MyTasks";

// Mirrors the tracker page's per-month localStorage key, so checking a task
// off here keeps it in sync with the Task Tracker on the same browser.
function monthKey(d: Date): string {
  return `tracker-v2-${d.getFullYear()}-${d.getMonth()}`;
}

/** Drew's master-tracker tasks due this calendar week, checkable in place. */
export default function DrewTasksThisWeek() {
  const { occ, imports } = useMemo<{ occ: TaskOccurrence[]; imports: ImportReminder[] }>(() => {
    const now = new Date();
    const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → start week on Monday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
    return { occ: taskOccurrencesBetween(start, end), imports: importsForWeek(start, end) };
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

    // Merge in SERVER-recorded completions (e.g. Harry processing the CC
    // invoicer auto-checks "Allocate CC Charges"), so a task finished by
    // someone else shows done here too — even in this browser's tracker.
    // Keyed `<year>-<month0>-<taskId>`, mapped onto the local month buckets.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tracker/completions", { cache: "no-store" });
        if (!res.ok) return;
        const { completions } = (await res.json()) as {
          completions: Record<string, { at: string }>;
        };
        if (cancelled || !completions) return;
        setChecked((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(completions)) {
            const idx = key.indexOf("-", key.indexOf("-") + 1); // after "<year>-<month0>"
            if (idx < 0) continue;
            const prefix = key.slice(0, idx);       // "<year>-<month0>"
            const taskId = key.slice(idx + 1);      // "<taskId>"
            const k = `tracker-v2-${prefix}`;
            if (!next[k]) next[k] = { ...(prev[k] ?? {}) };
            next[k] = { ...next[k], [taskId]: true };
          }
          return next;
        });
      } catch { /* best-effort — dashboard still works from localStorage */ }
    })();
    return () => { cancelled = true; };
  }, [occ]);

  // Which source files have actually been imported (so reminders show done vs
  // outstanding), keyed by reminder id.
  const [importEvents, setImportEvents] = useState<Record<string, ImportEvent>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tracker/import-events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.events) setImportEvents(j.events); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  // Completed tasks clear out of the list (check one and it disappears); undo
  // from the Tracker. Keep the count of how many were finished this week.
  const visible = occ.filter((o) => !checked[monthKey(o.date)]?.[o.id]);
  const doneCount = occ.length - visible.length;

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Tasks This Week{doneCount > 0 && <span style={{ marginLeft: 8, color: "#15803d", letterSpacing: 0 }}>· {doneCount} done</span>}
        </div>
        <Link href="/tracker" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
          Tracker →
        </Link>
      </div>
      {occ.length === 0 ? (
        <div className="muted small">No tracker tasks due this week.</div>
      ) : visible.length === 0 ? (
        <div className="muted small" style={{ color: "#15803d", fontWeight: 600 }}>✓ All {occ.length} task{occ.length === 1 ? "" : "s"} this week are done.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((o) => {
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
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(o)}
                  style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                />
              </label>
            );
          })}
        </div>
      )}

      {imports.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "#b45309", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: "#b45309", flexShrink: 0 }} />
            Files to Import This Week
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {imports.map((r) => {
              const ev = importEvents[r.id];
              const done = reminderSatisfied(r, ev?.at, new Date());
              return (
                <Link
                  key={r.id}
                  href={r.link}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 8,
                    border: done ? "1px solid rgba(21,128,61,0.3)" : "1px solid rgba(180,83,9,0.28)",
                    background: done ? "rgba(22,163,74,0.06)" : "rgba(180,83,9,0.06)",
                    textDecoration: "none", color: "inherit",
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: done ? "#15803d" : "#b45309", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: done ? "var(--muted)" : "#7c3d06", textDecoration: done ? "line-through" : undefined }}>{r.label}</div>
                    <div className="muted small" style={{ marginTop: 1 }}>
                      {done && ev ? `✓ imported ${new Date(ev.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${ev.by ? ` by ${ev.by}` : ""}` : `feeds ${r.feeds}`}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: done ? "#15803d" : "#b45309" }}>{done ? "Done" : r.when}</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Personal to-dos (private per user) ── */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <MyTasks compact title="My To-Dos" />
      </div>
    </div>
  );
}
