"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, taskOccurrencesBetween, type TaskOccurrence } from "../../lib/tracker/taskDefs";
import { importsForWeek, reminderSatisfied, type ImportReminder, type ImportEvent } from "../../lib/tracker/imports";

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

/** Morning until noon, afternoon until five, evening after — the greeting
 *  should match the room you're actually in. */
function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The all-clear.
 *
 * Everything else in this modal is a list of what still needs doing, so the
 * EMPTY state is the good one — and it used to be a single green line, which
 * read like a missing section rather than an achievement. It gets the one
 * flourish in the app: the same success mark the send confirmation draws
 * (so the two read as one language), plus a halo and a short spark burst.
 *
 * Cheap to justify: it plays once, on a modal shown once a day, and only when
 * there is genuinely nothing outstanding.
 */
function CaughtUp() {
  // Brand blue among the greens so the burst belongs to this app rather than
  // being generic confetti.
  const sparks = [
    { a: "0deg", d: "0.14s", c: "#15803d" }, { a: "45deg", d: "0.20s", c: "#0b4a7d" },
    { a: "90deg", d: "0.16s", c: "#15803d" }, { a: "135deg", d: "0.23s", c: "#22c55e" },
    { a: "180deg", d: "0.18s", c: "#0b4a7d" }, { a: "225deg", d: "0.15s", c: "#15803d" },
    { a: "270deg", d: "0.22s", c: "#22c55e" }, { a: "315deg", d: "0.17s", c: "#15803d" },
  ];

  return (
    <div style={{ padding: "14px 0 6px", textAlign: "center" }}>
      <div className="caughtup-mark">
        <span className="cu-halo" aria-hidden />
        {sparks.map((s, i) => (
          <span key={i} className="cu-spark" aria-hidden
            style={{ ["--a" as string]: s.a, ["--d" as string]: s.d, ["--cu-spark-color" as string]: s.c }} />
        ))}
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="rgba(22,163,74,0.08)" stroke="#15803d" strokeWidth="1.6" className="sent-ring" />
          <path d="M7.4 12.4l3.1 3.1 6.2-6.6" fill="none" stroke="#15803d" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" className="sent-check" />
        </svg>
      </div>

      <div className="caughtup-copy" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#15803d" }}>You&rsquo;re all caught up</div>
        <div className="muted small" style={{ marginTop: 4, lineHeight: 1.5 }}>
          Nothing due this week — every task is done and every file is imported.
        </div>
      </div>
    </div>
  );
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
  const [importEvents, setImportEvents] = useState<Record<string, ImportEvent>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tracker/import-events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.events) setImportEvents(j.events); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
  // Once a file is imported it drops off, exactly as it does on the
  // Tasks-This-Week card. The digest is a list of what still needs doing —
  // a completed row is only there to be scrolled past.
  const openImports = imports.filter((r) => !reminderSatisfied(r, importEvents[r.id]?.at, new Date()));
  const nothing = openTasks.length === 0 && openImports.length === 0;
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
          <div style={{ fontSize: 18, fontWeight: 800 }}>{greeting()} 👋</div>
          <button
            onClick={dismiss}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {/* The subtitle promised "tasks due and files to import" even when
            there were none, which set up a list that never arrived. */}
        <div className="muted small" style={{ marginBottom: nothing ? 0 : 16 }}>
          {nothing ? "Here's your week." : "Here's your week — tasks due and files to import."}
        </div>

        {nothing ? (
          <CaughtUp />
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
            {openImports.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: "#b45309", flexShrink: 0 }} />
                  Files to Import This Week{openImports.length > 1 ? ` · ${openImports.length} outstanding` : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {openImports.map((r) => (
                    <Link key={r.id} href={r.link} onClick={dismiss} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 8,
                      border: "1px solid rgba(180,83,9,0.28)",
                      background: "rgba(180,83,9,0.06)",
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
