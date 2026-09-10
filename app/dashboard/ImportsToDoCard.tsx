"use client";

// At-a-glance status of the recurring data imports (Rent Roll, GL, AP, 2000
// G&A GL, CC statement). Reads the source-of-truth list in lib/tracker/imports
// and the last-import events recorded server-side, then shows one row per
// import with its last saved date + who imported it — so it's easy to see at a
// glance what still needs importing. Styled to match DrewSavedStatus.

import { useEffect, useState } from "react";
import Link from "next/link";
import { IMPORT_REMINDERS, type ImportEvent } from "@/lib/tracker/imports";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ImportsToDoCard() {
  const [events, setEvents] = useState<Record<string, ImportEvent> | null>(null);

  useEffect(() => {
    fetch("/api/tracker/import-events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setEvents(j?.events ?? {}))
      .catch(() => setEvents({}));
  }, []);

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 12 }}>
        Data Imports
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {IMPORT_REMINDERS.map((r) => {
          const ev = events?.[r.id];
          const done = !!ev?.at;
          return <Row key={r.id} title={r.label} link={r.link} loading={events == null} done={done} ev={ev} />;
        })}
      </div>
    </div>
  );
}

function Row({
  title,
  link,
  loading,
  done,
  ev,
}: {
  title: string;
  link: string;
  loading: boolean;
  done: boolean;
  ev?: ImportEvent;
}) {
  const sub = done
    ? `Imported ${fmtDate(ev?.at)}${ev?.by ? ` · by ${String(ev.by).toUpperCase()}` : ""}`
    : "Not yet imported";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px", borderRadius: 8,
      border: "1px solid",
      borderColor: done ? "rgba(22,163,74,0.30)" : "rgba(15,23,42,0.12)",
      background: done ? "rgba(22,163,74,0.05)" : "rgba(15,23,42,0.025)",
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
        background: done ? "#16a34a" : "#64748b",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div className="muted small" style={{ marginTop: 2 }}>
          {loading ? "Loading…" : sub}
        </div>
      </div>
      <Link href={link} style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
        Open →
      </Link>
    </div>
  );
}
