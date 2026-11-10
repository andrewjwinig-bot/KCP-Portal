"use client";
import { Circle, CircleCheck } from "lucide-react";

// At-a-glance status of the recurring data imports (Rent Roll, GL, AP, 2000
// G&A GL, CC statement). Reads the source-of-truth list in lib/tracker/imports
// and the last-import events recorded server-side, then shows one row per
// import with its last saved date + who imported it — so it's easy to see at a
// glance what still needs importing. Styled to match DrewSavedStatus.

import { useEffect, useState } from "react";
import Link from "next/link";
import { HoverCard } from "@/app/components/HoverCard";
import type { TaskOwner } from "@/lib/tracker/taskDefs";
import { IMPORT_REMINDERS, sortByUrgency, reminderStatus, reminderPeriodLabel, type ImportCoverage, type ImportEvent, type ReminderStatus } from "@/lib/tracker/imports";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    // No year: every one of these is from the current cycle, and "Sep 1, 2026"
    // spends four characters saying what nobody was wondering.
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** `owner` narrows the list to that person's imports (Drew's or Harry's);
 *  with none (admin) it shows every one. */
export default function ImportsToDoCard({ owner }: { owner?: TaskOwner } = {}) {
  const reminders = owner ? IMPORT_REMINDERS.filter((r) => (r.owner ?? "drew") === owner) : IMPORT_REMINDERS;
  const [events, setEvents] = useState<Record<string, ImportEvent> | null>(null);
  // How much of a multi-file import actually landed. The GL is thirteen files,
  // so a timestamp cannot say whether the MONTH is in — this can.
  const [coverage, setCoverage] = useState<Record<string, ImportCoverage>>({});

  useEffect(() => {
    fetch("/api/tracker/import-events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setEvents(j?.events ?? {}); setCoverage(j?.coverage ?? {}); })
      .catch(() => setEvents({}));
  }, []);

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 12 }}>
        Data Imports
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* WORST FIRST, not most-recent-first. The card is asking "am I on top
            of these", and recency is the opposite of that signal: newest-first
            puts what you just did at the top and buries what you forgot at the
            bottom. */}
        {sortByUrgency(reminders, (r) => events?.[r.id]?.at, new Date(), (r) => coverage[r.id]).map((r) => {
          const ev = events?.[r.id];
          const cov = coverage[r.id];
          const status = reminderStatus(r, ev?.at, new Date(), cov);
          return <Row key={r.id} title={r.label} link={r.link} loading={events == null}
            status={status} when={r.when} period={reminderPeriodLabel(r, new Date())} ev={ev} coverage={cov} />;
        })}
      </div>
    </div>
  );
}

/** Three states, not two: a thing whose day has not come is not a thing you
 *  are behind on, and it must not wear the same colour as one you are. */
const DOT: Record<ReminderStatus, string> = {
  overdue: "#B42318", due: "#B54708", "not-yet-due": "#475467", done: "#067647",
};
/** Status is said in words, in the row's meta column — not by tinting the row. */
const STATUS_WORD: Record<ReminderStatus, string> = {
  overdue: "Overdue", due: "Due", "not-yet-due": "Not due yet", done: "Imported",
};
const EDGE: Record<ReminderStatus, { border: string; bg: string }> = {
  overdue:       { border: "var(--tint-red-line, rgba(220,38,38,0.40))",  bg: "var(--tint-red-bg, rgba(220,38,38,0.06))" },
  due:           { border: "var(--tint-amber-line, rgba(217,119,6,0.35))",  bg: "var(--tint-amber-bg, rgba(217,119,6,0.05))" },
  "not-yet-due": { border: "rgba(15,23,42,0.12)",   bg: "var(--tint-neutral-faint, rgba(15,23,42,0.025))" },
  done:          { border: "var(--tint-green-line, rgba(22,163,74,0.30))",  bg: "var(--tint-green-bg, rgba(22,163,74,0.05))" },
};

function Row({
  title,
  link,
  loading,
  status,
  when,
  period,
  ev,
  coverage,
}: {
  title: string;
  link: string;
  loading: boolean;
  status: ReminderStatus;
  /** When it is due, in plain words — "Every Wednesday", "At monthly close". */
  when: string;
  /** Which period is waiting — "August", "this week". */
  period: string | null;
  ev?: ImportEvent;
  /** For a multi-file import, how many properties are actually in. */
  coverage?: ImportCoverage;
}) {
  const done = status === "done";
  // THE SUB-LINE IS AN INSTRUCTION, NOT A REPORT. "August · overdue · 37 of 37
  // still to import — 0800, 0900, 1100, 1500…" ran to two lines and said one
  // thing: import August. The count moves to the pill (where a number belongs)
  // and the property names to its hover (where a list can be read), leaving
  // the row to say what to do.
  const sub = done
    ? coverage && coverage.total > 1
      // The ledger said every property is in — a stronger claim than a
      // timestamp, so make it.
      ? `All ${coverage.total} in${ev?.at ? ` · ${fmtDate(ev.at)}` : ""}`
      : ev?.at
        ? `Imported ${fmtDate(ev.at)}${ev?.by ? ` · by ${String(ev.by).replace(/^./, (c: string) => c.toUpperCase())}` : ""}`
        // In the store with no logged import (it predates the log) — still in.
        : `${period ? `${period[0].toUpperCase()}${period.slice(1)} is` : "Imported,"} in`
    : status === "not-yet-due"
      // Not due yet is not "behind" — say when it opens rather than nothing.
      ? `Due ${when.toLowerCase()}`
      : `Import ${period ?? when.toLowerCase()}`;
  return (
    <div className="task-row" style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 2px",
      borderBottom: "1px solid var(--hairline, var(--border))",
    }}>
      {done
        ? <CircleCheck size={20} strokeWidth={1.75} color={DOT.done} aria-hidden style={{ flexShrink: 0 }} />
        : <Circle size={20} strokeWidth={1.75} color={status === "not-yet-due" ? "var(--c-98a2b3)" : DOT[status]} aria-hidden style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* The TITLE is the link. A row whose whole point is "go here" does
            not need a separate "Open" to say so — and the bold text is the
            biggest, most obvious thing to click. */}
        <Link href={link} style={{ fontWeight: 700, fontSize: "var(--fs-14)", color: "inherit", textDecoration: "none" }}
          className="row-link">{title}</Link>
        {/* A count only means something when there is more than one thing to
            import (the GL's properties); a single statement run is in or not. */}
        {!loading && coverage && coverage.total > 1 && (
          // PROGRESS, so it ticks UP to 37/37 as the month goes in — a count
          // of what is LEFT would make 0 the good state, which reads wrong on
          // a green row. The property names live in the hover: a list of
          // thirty-seven codes is unreadable in a dashboard row and perfectly
          // readable in a card.
          <HoverCard
            title={`${title}${period ? ` · ${period[0].toUpperCase()}${period.slice(1)}` : ""}`}
            rows={[
              { label: "Imported", value: `${coverage.done} of ${coverage.total}`, color: DOT.done },
              ...(coverage.total > coverage.done
                ? [{ label: "Still to import", value: String(coverage.total - coverage.done), color: DOT[status] }]
                : []),
            ]}
            footer={coverage.behind.length ? { label: "Waiting on", value: coverage.behind.join(", ") } : undefined}
          >
            <span style={{
              marginLeft: 8, fontSize: "var(--fs-10)", fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              letterSpacing: "0.04em", whiteSpace: "nowrap", cursor: "default",
              background: "var(--c-f2f4f7)", color: "var(--c-344054)",
            }}>{coverage.done}/{coverage.total}</span>
          </HoverCard>
        )}
        <div className="muted small" style={{ marginTop: 2 }}>
          {loading ? "Loading…" : sub}
        </div>
      </div>
      {!loading && (
        <span style={{ flexShrink: 0, fontSize: "var(--fs-12-5)", fontWeight: status === "not-yet-due" ? 500 : 700, color: DOT[status], whiteSpace: "nowrap" }}>
          {STATUS_WORD[status]}
        </span>
      )}
    </div>
  );
}
