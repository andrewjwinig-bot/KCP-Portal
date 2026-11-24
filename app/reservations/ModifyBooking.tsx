"use client";

// MODIFY & BOOK — the panel inside a reservation's modal (owner, 11/2026:
// "if she selects modify in a specific request let her select a time … on
// the calendar to send back to tenant and actually override their booking").
// Pick the room, the day and the time; the day's timeline shows what else is
// held in that room (click an open spot to move there); "Book & email" saves
// the new time as APPROVED and emails the tenant the change. The checks are
// lib/reservations/reschedule.ts — the same ones the server runs.

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Calendar } from "@/app/components/Calendar";
import { StatusBanner } from "@/app/components/StatusBanner";
import { BOOKABLE_ROOMS } from "@/lib/reservations/rooms";
import type { Reservation } from "@/lib/reservations/storage";
import {
  OPEN_FROM, OPEN_TO, QUARTER_HOURS, dayBookings, moveTo, slotChanged, slotConflicts, slotError, type Slot,
} from "@/lib/reservations/reschedule";

const minutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const pretty = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const prettyDay = (iso: string) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const LABEL: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export function ModifyBooking({
  reservation, all, currentUser, onCancel, onBooked, onSuggestInstead,
}: {
  reservation: Reservation;
  all: Reservation[];
  currentUser: string;
  onCancel: () => void;
  onBooked: (r: Reservation, emailed: boolean) => void;
  onSuggestInstead: () => void;
}) {
  const [slot, setSlot] = useState<Slot>({
    roomUnitRef: reservation.roomUnitRef, date: reservation.date,
    startTime: reservation.startTime, endTime: reservation.endTime,
  });
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = slotError(slot);
  const clashes = useMemo(() => slotConflicts(all, slot, reservation.id), [all, slot, reservation.id]);
  const held = useMemo(() => dayBookings(all, slot.roomUnitRef, slot.date, reservation.id), [all, slot.roomUnitRef, slot.date, reservation.id]);
  const changed = slotChanged(reservation, slot);
  const room = BOOKABLE_ROOMS.find((r) => r.unitRef === slot.roomUnitRef);
  const canBook = !invalid && clashes.length === 0 && !busy && (changed || reservation.status !== "Approved");
  const hasEmail = !!reservation.contactEmail;

  async function book() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decidedBy: currentUser, reschedule: { ...slot, message, notify: notify && hasEmail } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Booking failed");
      onBooked(j.reservation, !!j.emailed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally { setBusy(false); }
  }

  // The day's timeline, 8 AM – 6 PM.
  const span = minutes(OPEN_TO) - minutes(OPEN_FROM);
  const pct = (t: string) => ((minutes(t) - minutes(OPEN_FROM)) / span) * 100;
  function pickAt(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const raw = minutes(OPEN_FROM) + ((e.clientX - box.left) / box.width) * span;
    const snapped = Math.round(raw / 15) * 15;
    const t = `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
    setSlot((s) => ({ ...s, ...moveTo(t, s) }));
  }
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => minutes(OPEN_FROM) / 60 + i);

  return (
    <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>Modify &amp; Book</span>
        <button onClick={onCancel} disabled={busy} className="btn sm" aria-label="Close"><X size={16} strokeWidth={1.75} aria-hidden /></button>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-14)" }}>
        Requested: {prettyDay((reservation.original ?? reservation).date)},{" "}
        {pretty((reservation.original ?? reservation).startTime)} – {pretty((reservation.original ?? reservation).endTime)}
        {reservation.original && " (as first asked)"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Room</span>
          <select value={slot.roomUnitRef} onChange={(e) => setSlot((s) => ({ ...s, roomUnitRef: e.target.value }))}>
            {BOOKABLE_ROOMS.map((r) => <option key={r.unitRef} value={r.unitRef}>{r.label} · {r.propertyName}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Date</span>
          <Calendar variant="card" value={slot.date} onChange={(d) => setSlot((s) => ({ ...s, date: d }))} disableWeekends minISO={todayISO()} />
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Start</span>
          <select value={slot.startTime} onChange={(e) => setSlot((s) => ({ ...s, ...moveTo(e.target.value, s) }))}>
            {QUARTER_HOURS.slice(0, -1).map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>End</span>
          <select value={slot.endTime} onChange={(e) => setSlot((s) => ({ ...s, endTime: e.target.value }))}>
            {QUARTER_HOURS.filter((t) => t > slot.startTime).map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>{room ? `${room.label} · ${room.propertyName}` : "Room"} on {/^\d{4}-\d{2}-\d{2}$/.test(slot.date) ? prettyDay(slot.date) : "—"} · click an open time to move there</span>
        <div
          onClick={pickAt}
          role="presentation"
          style={{ position: "relative", height: 48, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", background: "var(--card)", overflow: "hidden" }}
        >
          {hours.map((h) => (
            <div key={h} style={{ position: "absolute", top: 0, bottom: 0, left: `${((h * 60 - minutes(OPEN_FROM)) / span) * 100}%`, borderLeft: "1px solid var(--hairline)" }} />
          ))}
          {held.map((b) => (
            <div
              key={b.id}
              title={`${b.tenantCompany} · ${pretty(b.startTime)}–${pretty(b.endTime)}${b.status === "Pending" ? " (pending)" : ""}`}
              style={{
                position: "absolute", top: 6, bottom: 6, left: `${pct(b.startTime)}%`, width: `${pct(b.endTime) - pct(b.startTime)}%`,
                borderRadius: 6, padding: "2px 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                fontSize: "var(--fs-12)", fontWeight: 600, lineHeight: "32px",
                background: b.status === "Approved" ? "var(--border)" : "transparent",
                border: b.status === "Approved" ? "1px solid var(--border)" : "1px dashed var(--c-b54708)",
                color: "var(--text)",
              }}
            >
              {b.tenantCompany}
            </div>
          ))}
          {!invalid && (
            <div style={{
              position: "absolute", top: 3, bottom: 3, left: `${pct(slot.startTime)}%`, width: `${pct(slot.endTime) - pct(slot.startTime)}%`,
              borderRadius: 6, border: `2px solid ${clashes.length ? "var(--c-b42318)" : "var(--c-0b4a7d)"}`, background: "transparent",
              pointerEvents: "none",
            }} />
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-12)", color: "var(--muted)" }}>
          {hours.filter((_, i) => i % 2 === 0).map((h) => <span key={h}>{pretty(`${String(h).padStart(2, "0")}:00`)}</span>)}
        </div>
        <span className="muted" style={{ fontSize: "var(--fs-13)" }}>
          {held.length === 0 ? "Nothing else booked in this room that day." : "Grey = approved · dashed = pending request."}
        </span>
      </div>

      {invalid && <StatusBanner compact tone="warning" title={invalid} />}
      {!invalid && clashes.length > 0 && (
        <StatusBanner compact tone="danger" title="That time is already booked">
          {clashes.map((c) => `${c.tenantCompany} ${pretty(c.startTime)}–${pretty(c.endTime)}`).join(" · ")}
        </StatusBanner>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Note to the tenant (optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="e.g. The Building 6 room was booked at 10, so we moved you to 1 PM." />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-14)" }}>
        <input type="checkbox" checked={notify && hasEmail} disabled={!hasEmail} onChange={(e) => setNotify(e.target.checked)} />
        {hasEmail ? `Email the new time to ${reservation.contactEmail}` : "No email on file, so the tenant won't be told"}
      </label>

      {error && <StatusBanner compact tone="danger" title={error} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="text-link" onClick={onSuggestInstead} disabled={busy} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          Email alternates instead
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={busy} className="btn">Cancel</button>
          <button onClick={book} disabled={!canBook} className="btn primary">
            {busy ? "Booking…" : `Book ${/^\d{4}-\d{2}-\d{2}$/.test(slot.date) ? prettyDay(slot.date) : ""} ${pretty(slot.startTime)}${notify && hasEmail ? " & Email Tenant" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
