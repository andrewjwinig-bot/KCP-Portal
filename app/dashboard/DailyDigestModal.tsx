"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, taskOccurrencesBetween, type TaskOccurrence } from "../../lib/tracker/taskDefs";
import { importsForWeek, type ImportReminder } from "../../lib/tracker/imports";

// Same per-month localStorage bucket the Tracker + Tasks-This-Week card use,
// so "done" state is shared.
function monthKey(d: Date): string {
  return `tracker-v2-${d.getFullYear()}-${d.getMonth()}`;
}

// Local date (not UTC) as YYYY-MM-DD — the "seen it today" marker.
function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * First-visit-of-the-day popup that surfaces the week's open tasks + files to
 * import, so Drew can't miss them. Shows once per calendar day per user
 * (tracked in localStorage); dismiss with "Got it" or the backdrop.
 */
export default function DailyDigestModal({ userId }: { userId: string }) {
  const seenKey = `daily-digest-seen-${userId}`;

  const { occ, imports } = useMemo<{ occ: TaskOccurrence[]; imports: ImportReminder[] }>(() => {
    const now = new Date();
    const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → week starts Monday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
    return { occ: taskOccurrencesBetween(start, end), imports: importsForWeek(start, end) };
  }, []);

  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    // Only pop if we haven't shown it yet today.
    let shownToday = false;
    try { shownToday = localStorage.getItem(seenKey) === todayStamp(); } catch { /* ignore */ }

    // Load done-state (localStorage) then merge server completions, same as the
    // Tasks-This-Week card, so already-finished tasks don't resurface here.
    const maps: Record<string, Record<string, boolean>> = {};
    for (const o of occ) {
      const k = monthKey(o.date);
      if (maps[k]) continue;
      try { maps[k] = JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { maps[k] = {}; }
    }
    setChecked(maps);

    if (!shownToday) setOpen(true);

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
            const k = `tracker-v2-${key.slice(0, idx)}`;
            const taskId = key.slice(idx + 1);
            next[k] = { ...(next[k] ?? {}), [taskId]: true };
          }
          return next;
        });
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [occ, seenKey]);

  function dismiss() {
    try { localStorage.setItem(seenKey, todayStamp()); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;

  const openTasks = occ.filter((o) => !checked[monthKey(o.date)]?.[o.id]);
  const nothing = openTasks.length === 0 && imports.length === 0;
  const todayKey = new Date().toDateString();

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "6vh 16px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 540, margin: 0, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Good morning 👋</div>
          <button
            onClick={dismiss}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="muted small" style={{ marginBottom: 16 }}>
          Here's your week — tasks due and files to import.
        </div>

        {nothing ? (
          <div className="muted small" style={{ color: "#15803d", fontWeight: 600, padding: "8px 0" }}>
            ✓ You're all caught up — nothing due this week.
          </div>
        ) : (
          <>
            {/* ── Tasks ── */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>
              Tasks This Week{openTasks.length > 0 && <span style={{ letterSpacing: 0 }}> · {openTasks.length} open</span>}
            </div>
            {openTasks.length === 0 ? (
              <div className="muted small" style={{ color: "#15803d", fontWeight: 600, marginBottom: 14 }}>
                ✓ All tasks this week are done.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {openTasks.map((o) => {
                  const isToday = o.date.toDateString() === todayKey;
                  const dot = CATEGORIES[o.category]?.dot ?? "#64748b";
                  return (
                    <div key={o.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 8,
                      border: "1px solid",
                      borderColor: isToday ? "rgba(11,74,125,0.35)" : "rgba(15,23,42,0.12)",
                      background: isToday ? "rgba(11,74,125,0.06)" : "rgba(15,23,42,0.025)",
                    }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                      <div className="muted small" style={{ flexShrink: 0, fontWeight: isToday ? 700 : 400 }}>
                        {isToday ? "Today" : o.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Files to import ── */}
            {imports.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: "#b45309", flexShrink: 0 }} />
                  Files to Import This Week
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {imports.map((r) => (
                    <Link key={r.id} href={r.link} onClick={dismiss} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 8,
                      border: "1px solid rgba(180,83,9,0.28)", background: "rgba(180,83,9,0.06)",
                      textDecoration: "none", color: "inherit",
                    }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: "#b45309", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#7c3d06" }}>{r.label}</div>
                        <div className="muted small" style={{ marginTop: 1 }}>feeds {r.feeds}</div>
                      </div>
                      <div style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#b45309" }}>{r.when}</div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <Link href="/tracker" onClick={dismiss} style={{ fontSize: 13, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
            Open Tracker →
          </Link>
          <button
            onClick={dismiss}
            style={{
              border: "none", borderRadius: 8, padding: "9px 18px",
              background: "#0b4a7d", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
