"use client";

import { useMemo, useState } from "react";
import type { Reservation } from "@/lib/reservations/storage";
import { reservationStatusTone } from "@/app/components/Pill";

// Business-hours window the week grid renders.
const HOUR_START = 7;   // 7 AM
const HOUR_END = 21;    // 9 PM
const ROW_H = 44;       // px per hour
const BODY_H = (HOUR_END - HOUR_START) * ROW_H;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function minutesOf(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function prettyTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m[2]} ${ampm}`;
}

function hourLabel(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12} ${ampm}`;
}

// Assign overlapping reservations within one day to side-by-side columns.
type Laid = { res: Reservation; col: number; cols: number };
function layoutDay(items: Reservation[]): Laid[] {
  const sorted = [...items].sort(
    (a, b) => minutesOf(a.startTime) - minutesOf(b.startTime) || minutesOf(a.endTime) - minutesOf(b.endTime),
  );
  const out: Laid[] = [];
  let cluster: Reservation[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy column packing within the cluster.
    const colEnds: number[] = [];
    const assigned = cluster.map((r) => {
      const start = minutesOf(r.startTime);
      let col = colEnds.findIndex((end) => end <= start);
      if (col === -1) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = minutesOf(r.endTime);
      return { res: r, col };
    });
    const cols = colEnds.length;
    for (const a of assigned) out.push({ ...a, cols });
    cluster = [];
    clusterEnd = -1;
  };

  for (const r of sorted) {
    const start = minutesOf(r.startTime);
    if (cluster.length > 0 && start >= clusterEnd) flush();
    cluster.push(r);
    clusterEnd = Math.max(clusterEnd, minutesOf(r.endTime));
  }
  flush();
  return out;
}

export default function WeekCalendar({
  reservations,
  onSelect,
}: {
  reservations: Reservation[];
  onSelect: (r: Reservation) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      const list = map.get(r.date);
      if (list) list.push(r);
      else map.set(r.date, [r]);
    }
    return map;
  }, [reservations]);

  const todayISO = toISODate(new Date());
  const rangeLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  function shiftWeek(delta: number) {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Week navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{rangeLabel}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn" style={navBtn} onClick={() => shiftWeek(-1)} title="Previous week">‹</button>
          <button className="btn" style={{ ...navBtn, width: "auto", padding: "5px 12px" }}
            onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
          <button className="btn" style={navBtn} onClick={() => shiftWeek(1)} title="Next week">›</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
        <div />
        {days.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === todayISO;
          return (
            <div key={iso} style={{
              padding: "8px 4px", textAlign: "center",
              borderLeft: "1px solid var(--border)",
              background: isToday ? "rgba(11,74,125,0.06)" : undefined,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--muted)" }}>
                {DAY_LABELS[d.getDay()]}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                color: isToday ? "#0b4a7d" : "var(--text)",
              }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", position: "relative" }}>
        {/* Hour gutter */}
        <div style={{ position: "relative", height: BODY_H }}>
          {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
            <div key={i} style={{
              position: "absolute", top: i * ROW_H, right: 6,
              fontSize: 10, fontWeight: 600, color: "var(--muted)",
              transform: "translateY(-50%)",
            }}>{i === 0 ? "" : hourLabel(HOUR_START + i)}</div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === todayISO;
          const laid = layoutDay(byDay.get(iso) ?? []);
          return (
            <div key={iso} style={{
              position: "relative", height: BODY_H,
              borderLeft: "1px solid var(--border)",
              background: isToday ? "rgba(11,74,125,0.03)" : undefined,
            }}>
              {/* Hour lines */}
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div key={i} style={{
                  position: "absolute", top: i * ROW_H, left: 0, right: 0,
                  borderTop: "1px solid var(--border)",
                }} />
              ))}
              {/* Reservation blocks */}
              {laid.map(({ res, col, cols }) => {
                const start = minutesOf(res.startTime);
                const end = minutesOf(res.endTime);
                const winStart = HOUR_START * 60;
                const winEnd = HOUR_END * 60;
                const top = ((Math.max(start, winStart) - winStart) / 60) * ROW_H;
                const height = Math.max(
                  16,
                  ((Math.min(end, winEnd) - Math.max(start, winStart)) / 60) * ROW_H - 2,
                );
                const tone = reservationStatusTone(res.status);
                const widthPct = 100 / cols;
                return (
                  <button
                    key={res.id}
                    onClick={() => onSelect(res)}
                    title={`${res.roomLabel} — ${res.tenantCompany}\n${prettyTime(res.startTime)}–${prettyTime(res.endTime)}`}
                    style={{
                      position: "absolute",
                      top, height,
                      left: `calc(${col * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                      borderLeft: `3px solid ${tone.fg}`,
                      borderRadius: 5,
                      padding: "2px 5px",
                      textAlign: "left",
                      cursor: "pointer",
                      overflow: "hidden",
                      display: "flex", flexDirection: "column", gap: 1,
                      opacity: res.status === "Declined" ? 0.55 : 1,
                    }}
                  >
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: tone.fg, lineHeight: 1.15,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{res.tenantCompany || "Reservation"}</span>
                    {height > 30 && (
                      <span style={{
                        fontSize: 10, color: tone.fg, lineHeight: 1.15,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{prettyTime(res.startTime)} · {res.roomLabel}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, width: 30, padding: "5px 0",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
