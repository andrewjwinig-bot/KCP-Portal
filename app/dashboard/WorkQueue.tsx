"use client";

// DREW'S WORK QUEUE — the dashboard as the design canvas's "Work Queue" board
// (owner, 11/2026: "one master task list … approvals should be in the portal").
// One list of everything that needs him, built from records the portal already
// keeps — his tasks and to-dos, the imports still owed, the month's close
// (bank recs, flags, close-outs), invoices generated but never sent — and a
// second list of what is waiting on someone else. Nothing here is keyed except
// ticking a task. Approving / commenting in place comes with the shared queue
// store; until then each row opens the page where the action lives.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleCheck, Clock, FileCheck, Flag, Landmark, Plus, Send, Upload, UserRound, type LucideIcon,
} from "lucide-react";
import { RoundCheck } from "@/app/components/RoundCheck";
import { TaskModal } from "@/app/components/MyTasks";
import MonthCloseCard from "./MonthCloseCard";
import { taskOccurrencesBetween, type TaskOccurrence, type TaskOwner } from "@/lib/tracker/taskDefs";
import { ImportStepsButton } from "@/app/components/ImportStepsButton";
import { IMPORT_REMINDERS, reminderStatus, reminderPeriodLabel, type ImportCoverage, type ImportEvent } from "@/lib/tracker/imports";
import { openBucketOf, parseDueDate, priorityOf, type Priority, type Repeat, type Todo } from "@/lib/todos/types";
import type { MonthClose, CloseItem } from "@/lib/close/monthClose";
import type { CloseDetail } from "@/lib/close/monthCloseMath";

/** A tracker task that IS an import (the Bank Balances Monday task). */
const TASK_IMPORT: Record<string, string> = { "w-bank": "imp-bank" };

type Bucket = "overdue" | "today" | "week" | "later";
type Tone = "red" | "amber" | "brand" | "neutral" | "green";
type Q = {
  id: string;
  kind: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  meta: string;
  /** Where it came from — "Auto · GL schedule", "Recurring", "With Nancy". */
  source: string;
  bucket: Bucket;
  dueText: string;
  href?: string;
  action?: string;
  /** Whose move it is: "me" or a person / "Automatic" / "GL". */
  who: string;
  done?: boolean;
  toggle?: () => void;
  trail?: { text: string; at: string }[];
  left?: CloseDetail[];
  /** Import steps id (`lib/tracker/importSteps.ts`) — draws the (i) beside the title. */
  steps?: string;
};

const TONE: Record<Tone, { bg: string; fg: string }> = {
  red: { bg: "var(--tint-red-bg, #FEF3F2)", fg: "var(--c-b42318)" },
  amber: { bg: "var(--tint-amber-bg, #FFFAEB)", fg: "var(--c-b54708)" },
  brand: { bg: "var(--tint-brand-bg, #EEF3F8)", fg: "var(--c-0b4a7d)" },
  neutral: { bg: "var(--tint-neutral-bg, #F2F4F7)", fg: "var(--muted)" },
  green: { bg: "var(--tint-green-bg, #ECFDF3)", fg: "var(--c-067647)" },
};
const SECTION: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" };
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: Date) => `${DAY[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const monthKey = (d: Date) => `tracker-v2-${d.getFullYear()}-${d.getMonth()}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function bucketOf(d: Date | null, now: Date): Bucket {
  if (!d) return "later";
  const today = startOfDay(now);
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  const sinceMon = (now.getDay() + 6) % 7;
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMon + 6);
  return d <= sunday ? "week" : "later";
}
const dueOf = (d: Date | null, now: Date) => {
  if (!d) return "No date";
  const b = bucketOf(d, now);
  return b === "overdue" ? `Overdue · ${MON[d.getMonth()]} ${d.getDate()}` : b === "today" ? "Today" : shortDate(d);
};

const UNSENT_HREF: Record<string, string> = { allocated: "/allocated-invoicer", "credit-card": "/expenses", payroll: "/" };

export default function WorkQueue({ firstName, owner = "drew" }: { firstName: string; owner?: TaskOwner }) {
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<"me" | "waiting" | "everyone" | "done">("me");
  const [sel, setSel] = useState<string | null>(null);

  // ── Tasks: this week + next week's (Later), ticked as the tracker ticks them ──
  const occ = useMemo(() => {
    const sinceMon = (now.getDay() + 6) % 7;
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    const end = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 13, 23, 59, 59);
    return taskOccurrencesBetween(mon, end, now);
  }, [now]);
  const [checked, setChecked] = useState<Record<string, Record<string, boolean>>>({});
  useEffect(() => {
    const maps: Record<string, Record<string, boolean>> = {};
    for (const o of occ) {
      const k = monthKey(o.date);
      if (maps[k]) continue;
      try { maps[k] = JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { maps[k] = {}; }
    }
    setChecked(maps);
    fetch("/api/tracker/completions", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const completions = (j?.completions ?? {}) as Record<string, unknown>;
      setChecked((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(completions)) {
          const idx = key.indexOf("-", key.indexOf("-") + 1);
          if (idx < 0) continue;
          const k = `tracker-v2-${key.slice(0, idx)}`;
          next[k] = { ...(next[k] ?? {}), [key.slice(idx + 1)]: true };
        }
        return next;
      });
    }).catch(() => {});
  }, [occ]);
  function toggleOcc(o: TaskOccurrence) {
    const k = monthKey(o.date);
    setChecked((prev) => {
      const m = { ...(prev[k] ?? {}), [o.id]: !prev[k]?.[o.id] };
      try { localStorage.setItem(k, JSON.stringify(m)); } catch { /* ignore */ }
      return { ...prev, [k]: m };
    });
  }

  // ── Personal to-dos ──
  const [todos, setTodos] = useState<Todo[]>([]);
  const [modal, setModal] = useState(false);
  useEffect(() => {
    fetch("/api/todos").then((r) => (r.ok ? r.json() : null)).then((j) => { if (Array.isArray(j?.todos)) setTodos(j.todos); }).catch(() => {});
  }, []);
  async function toggleTodo(t: Todo) {
    const done = !t.done;
    setTodos((p) => p.map((x) => (x.id === t.id ? { ...x, done } : x)));
    try {
      const r = await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, done }) });
      const j = await r.json();
      if (!r.ok) throw new Error();
      setTodos((p) => { const u = p.map((x) => (x.id === t.id ? j.todo : x)); return j.next ? [...u, j.next] : u; });
    } catch { setTodos((p) => p.map((x) => (x.id === t.id ? { ...x, done: !done } : x))); }
  }
  async function createTodo(fields: { text: string; due: string | null; repeat: Repeat; priority: Priority; note?: string }) {
    const r = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Failed to add");
    setTodos((p) => [...p, j.todo]);
  }

  // ── Imports, the close, unsent batches, flags ──
  const [events, setEvents] = useState<Record<string, ImportEvent>>({});
  const [coverage, setCoverage] = useState<Record<string, ImportCoverage>>({});
  const [close, setClose] = useState<MonthClose | null>(null);
  const [unsent, setUnsent] = useState<{ source: string; label: string; period: string; at: string; days: number }[]>([]);
  const [flags, setFlags] = useState<{ n: number; props: { code: string; name: string; n: number }[] } | null>(null);
  useEffect(() => {
    fetch("/api/tracker/import-events", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { setEvents(j?.events ?? {}); setCoverage(j?.coverage ?? {}); }).catch(() => {});
    fetch("/api/close", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j) return;
      setClose(j);
      const [y, mo] = String(j.month).split("-").map(Number);
      fetch(`/api/financials/operating-statements/review?year=${y}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((rv) => {
        if (!rv?.properties) return;
        const props = (rv.properties as { propertyCode: string; propertyName: string; lines: { months: { period: number }[] }[]; issues: { period: number }[] }[])
          .map((p) => ({ code: p.propertyCode, name: p.propertyName,
            n: p.lines.reduce((s, l) => s + l.months.filter((m) => m.period === mo).length, 0) + p.issues.filter((x) => x.period === mo).length }))
          .filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
        setFlags({ n: props.reduce((s, p) => s + p.n, 0), props });
      }).catch(() => {});
    }).catch(() => {});
    fetch("/api/avid-sends?limit=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => setUnsent(j?.unsent ?? [])).catch(() => {});
  }, []);

  // ── The items ──
  const items: Q[] = useMemo(() => {
    const out: Q[] = [];
    const closeLabel = close?.label.split(" ")[0] ?? "";

    for (const o of occ) {
      const done = !!checked[monthKey(o.date)]?.[o.id];
      const mine = o.owner === owner;
      out.push({
        id: `occ-${o.id}-${o.date.toISOString().slice(0, 10)}`, kind: "Task", icon: CircleCheck, tone: "neutral",
        title: o.label, meta: "Recurring", source: mine ? "Task Tracker" : `${o.owner[0].toUpperCase()}${o.owner.slice(1)}'s task`,
        bucket: bucketOf(startOfDay(o.date), now), dueText: dueOf(startOfDay(o.date), now), href: o.link ?? "/tracker",
        who: mine ? "me" : `${o.owner[0].toUpperCase()}${o.owner.slice(1)}`, done, toggle: mine ? () => toggleOcc(o) : undefined,
        steps: TASK_IMPORT[o.id],
      });
    }
    for (const t of todos) {
      const due = parseDueDate(t.due);
      const b = openBucketOf(t, now);
      out.push({
        id: `todo-${t.id}`, kind: "To-do", icon: CircleCheck, tone: "neutral", title: t.text,
        meta: priorityOf(t) === "high" ? "High priority" : t.note || "Your to-do", source: "My tasks",
        bucket: b === "overdue" ? "overdue" : b === "someday" ? "later" : bucketOf(due, now), dueText: dueOf(due, now),
        who: "me", done: !!t.done, toggle: () => toggleTodo(t),
      });
    }
    // A weekly import that is also a tracker task (Bank Balances) is listed
    // once — the task, which the import ticks.
    const taskLabels = new Set(occ.filter((o) => o.owner === owner).map((o) => o.label.toLowerCase()));
    for (const r of IMPORT_REMINDERS.filter((x) => (x.owner ?? "drew") === owner && !taskLabels.has(x.label.toLowerCase()))) {
      const st = reminderStatus(r, events[r.id]?.at, now, coverage[r.id]);
      const cov = coverage[r.id];
      const period = reminderPeriodLabel(r, now);
      out.push({
        id: `imp-${r.id}`, kind: "Import", icon: Upload, tone: st === "overdue" ? "red" : st === "due" ? "amber" : "neutral",
        title: `Import ${period && period !== "this week" && period !== "this pay period" ? `${period} ` : ""}${r.label}`,
        meta: cov && cov.total > 1 ? `${cov.done} of ${cov.total} in${cov.behind.length ? ` · still to import: ${cov.behind.slice(0, 6).join(", ")}${cov.behind.length > 6 ? "…" : ""}` : ""}` : r.feeds,
        source: "Auto · import schedule", bucket: st === "overdue" ? "overdue" : st === "due" ? "today" : "later",
        dueText: st === "overdue" ? "Overdue" : st === "due" ? "Due now" : r.when, href: r.link, action: "Import",
        who: "me", done: st === "done", steps: r.id,
      });
    }
    for (const u of unsent) {
      out.push({
        id: `unsent-${u.source}-${u.period}`, kind: "Not sent", icon: Send, tone: "red",
        title: `${u.label} ${u.period} was generated but not sent to AvidXchange`, meta: `Processed ${when(u.at)} · ${u.days} days ago`,
        source: "Auto · AP Outbox", bucket: "overdue", dueText: `${u.days} days`, href: UNSENT_HREF[u.source] ?? "/", action: "Send", who: "me",
      });
    }
    if (flags && flags.n > 0) {
      out.push({
        id: "flags", kind: "Flags", icon: Flag, tone: "amber", title: `Clear ${flags.n} flag${flags.n === 1 ? "" : "s"} — ${closeLabel} statements`,
        meta: flags.props.slice(0, 3).map((p) => `${p.code} ${p.n}`).join(" · ") + (flags.props.length > 3 ? ` · ${flags.props.length - 3} more` : ""),
        source: "Auto · Flags to Investigate", bucket: "week", dueText: "This week", href: "/financials/operating-statements/review", action: "Review",
        who: "me", left: flags.props.map((p) => ({ text: `${p.code} ${p.name}`, meta: `${p.n} open` })),
      });
    }
    const ci = (id: string): CloseItem | undefined => close?.sections.flatMap((s) => s.items).find((i) => i.id === id);
    const rec = ci("bankrec");
    if (rec && !rec.done) {
      out.push({
        id: "bankrec", kind: "Bank recs", icon: Landmark, tone: rec.detail.some((d) => d.meta === "out of balance") ? "red" : "amber",
        title: `${closeLabel} bank recs — ${rec.status}`, meta: rec.detail.slice(0, 2).map((d) => `${d.text} ${d.meta ?? ""}`.trim()).join(" · ") || "Drop the month's statements on Bank Recs",
        source: "Auto · Bank Recs", bucket: "week", dueText: "This week", href: rec.link, action: "Open rec", who: "me", left: rec.detail, steps: "bankrec",
      });
    }
    for (const id of ["allocated", "cc", "payroll", "commissions"]) {
      const it = ci(id);
      if (!it || it.done) continue;
      const who = it.owner === "Automatic" ? "Automatic" : it.owner;
      out.push({
        id: `avid-${id}`, kind: "AvidXchange", icon: who === "Automatic" ? Clock : UserRound, tone: "neutral",
        title: `${it.label} · ${closeLabel}`, meta: who === "Automatic" ? `${it.status} · sends itself ${it.due.toLowerCase()}` : it.status,
        source: who === "Automatic" ? "Automatic" : `With ${who}`, bucket: "week", dueText: it.due, href: it.link, who,
      });
    }
    for (const d of ci("closeouts")?.detail ?? []) {
      const mine = d.who === "Drew";
      out.push({
        id: `co-${d.text}`, kind: "Close-out", icon: mine ? FileCheck : Clock, tone: mine ? (d.tone === "red" ? "red" : "amber") : "neutral",
        title: `Close-out — ${d.text}`, meta: d.meta ?? "", source: mine ? "Auto · move-out watcher" : d.who === "GL" ? "Waiting on the GL" : `With ${d.who}`,
        bucket: mine ? "today" : "week", dueText: mine ? "Today" : d.meta?.match(/since (.+)$/)?.[1] ?? "",
        href: d.href, action: mine ? (d.meta?.startsWith("Ready") ? "Send" : "Open") : undefined,
        who: mine ? "me" : d.who === "GL" ? "GL" : d.who ?? "", trail: d.trail,
      });
    }
    return out;
  }, [occ, checked, todos, events, coverage, unsent, flags, close, now, owner]);

  const isMine = (q: Q) => q.who === "me";
  const isWaiting = (q: Q) => !isMine(q) && !q.id.startsWith("occ-");
  const shown = items.filter((q) =>
    tab === "done" ? q.done && (isMine(q) || q.id.startsWith("imp-"))
    : q.done ? false
    : tab === "me" ? isMine(q) : tab === "waiting" ? isWaiting(q) : true);
  const counts = {
    me: items.filter((q) => !q.done && isMine(q)).length,
    waiting: items.filter((q) => !q.done && isWaiting(q)).length,
    everyone: items.filter((q) => !q.done).length,
    done: items.filter((q) => q.done && isMine(q)).length,
  };
  const overdue = items.filter((q) => !q.done && isMine(q) && q.bucket === "overdue").length;

  const SECTIONS: [Bucket, string, string][] = [["overdue", "Overdue", "var(--c-b42318)"], ["today", "Today", "var(--text)"], ["week", "This week", "var(--muted)"], ["later", "Later", "var(--muted)"]];
  const groups = tab === "waiting" || tab === "done"
    ? [{ key: tab, label: tab === "done" ? "Done" : "Waiting on others", color: "var(--muted)", rows: shown }]
    : SECTIONS.map(([b, label, color]) => ({ key: b, label, color, rows: shown.filter((q) => q.bucket === b) })).filter((g) => g.rows.length);

  const selected = shown.find((q) => q.id === sel) ?? shown[0] ?? null;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ ...SECTION, color: "var(--muted)" }}>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <h1 style={{ margin: 0 }}>{greeting}, {firstName}</h1>
          <span style={{ color: "var(--muted)", fontSize: "var(--fs-14)" }}>
            {counts.me} thing{counts.me === 1 ? "" : "s"} need you{overdue ? ` · ${overdue} overdue` : ""} · {counts.waiting} waiting on others
          </span>
        </div>
        <button className="btn" onClick={() => setModal(true)}><Plus size={16} strokeWidth={1.75} aria-hidden /> New task</button>
      </div>

      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 28, borderBottom: "1px solid var(--border)" }}>
        {([["me", "Needs me", counts.me], ["waiting", "Waiting on others", counts.waiting], ["everyone", "Everyone", counts.everyone], ["done", "Done", counts.done]] as const).map(([k, label, n]) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setTab(k); setSel(null); }}
              style={{ border: 0, background: "transparent", cursor: "pointer", padding: "10px 0 12px", marginBottom: -1, fontSize: "var(--fs-14)", fontWeight: on ? 700 : 500, color: on ? "var(--c-0b4a7d)" : "var(--muted)", borderBottom: `3px solid ${on ? "var(--c-0b4a7d)" : "transparent"}`, display: "inline-flex", gap: 8, alignItems: "center", minHeight: 0 }}>
              {label}
              <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: on ? "#fff" : "var(--muted)", background: on ? "var(--c-0b4a7d)" : "var(--hairline)", padding: "1px 8px", borderRadius: 999 }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="queue-grid">
        <section className="card queue-list" style={{ padding: "8px 22px 14px" }}>
          {groups.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", display: "grid", justifyItems: "center", gap: 8, color: "var(--muted)" }}>
              <CircleCheck size={24} strokeWidth={1.75} color="var(--c-067647)" />
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{tab === "me" ? "Nothing needs you right now" : "Nothing here"}</span>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "16px 2px 4px" }}>
                <span style={{ ...SECTION, color: g.color }}>{g.label}</span>
                <span style={{ fontSize: "var(--fs-13)", color: "var(--muted)" }}>{g.rows.length} item{g.rows.length === 1 ? "" : "s"}</span>
              </div>
              {g.rows.map((q) => {
                const on = selected?.id === q.id;
                const t = TONE[q.tone];
                const Icon = q.icon;
                return (
                  <div key={q.id} className="task-row queue-row" onClick={() => setSel(q.id)}
                    style={{ padding: "11px 10px", margin: "0 -10px", borderBottom: "1px solid var(--hairline)", borderRadius: 8, cursor: "pointer", background: on ? "var(--tint-brand-bg, #EEF3F8)" : undefined, opacity: q.done ? 0.6 : 1 }}>
                    {q.toggle
                      ? <span style={{ display: "flex", justifyContent: "center" }}><RoundCheck done={!!q.done} onToggle={q.toggle} label={`Mark ${q.title} done`} /></span>
                      : <span style={{ width: 34, height: 34, borderRadius: 999, background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={16} strokeWidth={1.75} /></span>}
                    <div style={{ minWidth: 0, display: "grid", gap: 1 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, fontSize: "var(--fs-14)" }}>
                        <span style={{ textDecoration: q.done ? "line-through" : undefined }}>{q.title}</span>
                        {q.steps && <ImportStepsButton id={q.steps} />}
                      </span>
                      {q.meta && <span style={{ fontSize: "var(--fs-13)", color: "var(--muted)" }}>{q.meta}</span>}
                    </div>
                    <div className="queue-row-side">
                      <div className="queue-row-due">
                        <span style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: q.done ? "var(--c-067647)" : q.bucket === "overdue" ? "var(--c-b42318)" : "var(--text)", whiteSpace: "nowrap" }}>{q.done ? "Done" : q.dueText}</span>
                        <span style={{ fontSize: "var(--fs-12)", color: "var(--muted)", whiteSpace: "nowrap" }}>{q.source}</span>
                      </div>
                      {q.action && q.href && !q.done && (
                        <Link href={q.href} className={`btn sm${q.tone === "red" || q.kind === "Close-out" ? " primary" : ""}`} style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>{q.action}</Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>

        <aside className="queue-aside">
          {selected && (
            <section className="card queue-detail" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ ...SECTION, color: TONE[selected.tone].fg === "var(--muted)" ? "var(--muted)" : TONE[selected.tone].fg }}>{selected.kind}</span>
                <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>{selected.title}</span>
                <span style={{ fontSize: "var(--fs-14)", color: "var(--muted)" }}>{[selected.meta, selected.source].filter(Boolean).join(" · ")}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {selected.href && <Link href={selected.href} className="btn primary" style={{ textDecoration: "none" }}>{selected.action ?? "Open"}</Link>}
                {selected.toggle && <button className="btn" onClick={selected.toggle}>{selected.done ? "Mark not done" : "Mark done"}</button>}
              </div>
              {selected.left && selected.left.length > 0 && (
                <div style={{ display: "grid" }}>
                  <span style={{ ...SECTION, color: "var(--muted)", paddingBottom: 4 }}>What&apos;s left</span>
                  {selected.left.slice(0, 12).map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--hairline)", fontSize: "var(--fs-14)" }}>
                      <span>{d.text}</span><span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{d.meta}</span>
                    </div>
                  ))}
                  {selected.left.length > 12 && <span style={{ color: "var(--muted)", fontSize: "var(--fs-13)", paddingTop: 6 }}>+ {selected.left.length - 12} more</span>}
                </div>
              )}
              {selected.trail && selected.trail.length > 0 && (
                <div style={{ display: "grid" }}>
                  <span style={{ ...SECTION, color: "var(--muted)", paddingBottom: 4 }}>Trail</span>
                  {selected.trail.map((e, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 10, padding: "6px 0" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: i === selected.trail!.length - 1 ? "var(--c-0b4a7d)" : "var(--c-98a2b3)", marginTop: 6 }} />
                      <div style={{ display: "grid" }}>
                        <span style={{ fontSize: "var(--fs-14)" }}>{e.text}</span>
                        <span style={{ fontSize: "var(--fs-13)", color: "var(--muted)" }}>{when(e.at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          <div style={{ display: "grid" }}><MonthCloseCard close={close} /></div>
        </aside>
      </div>
      {modal && <TaskModal onClose={() => setModal(false)} onSave={async (f) => { await createTodo(f); setModal(false); }} />}
    </div>
  );
}
