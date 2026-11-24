// STAFF MODIFY & BOOK (owner, 11/2026: "allow nancy to modify and book
// reservation requests … select a time and stuff on the calendar to send back
// to tenant and actually override their booking"). Pure and client-safe: the
// modal's panel and the PATCH route run the SAME checks, so what the panel
// says is free is what the server books.
//
// A modify REPLACES the tenant's room / date / time and approves it. The
// tenant's first request is kept on `original` (set once — a second modify
// never overwrites what they actually asked for), so the email and the modal
// can say "you asked for X, you're booked for Y".

import { timesOverlap } from "./conflict";
import type { Room } from "./rooms";
import type { Reservation } from "./storage";

export type Slot = { roomUnitRef: string; date: string; startTime: string; endTime: string };

export const OPEN_FROM = "08:00";
export const OPEN_TO = "18:00";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** 08:00 … 18:00 in 15-minute steps — the tenant form's own options. */
export const QUARTER_HOURS: string[] = (() => {
  const out: string[] = [];
  for (let m = minutes(OPEN_FROM); m <= minutes(OPEN_TO); m += 15) out.push(hhmm(m));
  return out;
})();

/** The tenant form's rules: a weekday, 8–6, 15-minute steps, end after start.
 *  null when the slot is bookable. */
export function slotError(s: Pick<Slot, "date" | "startTime" | "endTime">): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return "Pick a date.";
  if (!/^\d{2}:\d{2}$/.test(s.startTime) || !/^\d{2}:\d{2}$/.test(s.endTime)) return "Pick a start and end time.";
  if (s.startTime >= s.endTime) return "End time must be after the start time.";
  const [y, mo, d] = s.date.split("-").map(Number);
  const dow = new Date(y, mo - 1, d).getDay();
  if (dow === 0 || dow === 6) return "Rooms are booked Monday through Friday only.";
  if (s.startTime < OPEN_FROM || s.endTime > OPEN_TO) return "Times must be between 8:00 AM and 6:00 PM.";
  if (minutes(s.startTime) % 15 || minutes(s.endTime) % 15) return "Use 15-minute steps.";
  return null;
}

/** Approved bookings the slot would step on — never the reservation itself. */
export function slotConflicts(all: Reservation[], s: Slot, selfId: string): Reservation[] {
  return all.filter((r) =>
    r.id !== selfId && r.status === "Approved" && r.roomUnitRef === s.roomUnitRef && r.date === s.date
    && timesOverlap(s.startTime, s.endTime, r.startTime, r.endTime));
}

/** Everything else held in that room that day (approved + pending), by start. */
export function dayBookings(all: Reservation[], roomUnitRef: string, date: string, selfId: string): Reservation[] {
  return all
    .filter((r) => r.id !== selfId && r.status !== "Declined" && r.roomUnitRef === roomUnitRef && r.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Keep the same length, starting at `start` — clamped to closing time. */
export function moveTo(start: string, prev: Pick<Slot, "startTime" | "endTime">): { startTime: string; endTime: string } {
  const len = Math.max(15, minutes(prev.endTime) - minutes(prev.startTime));
  const s = Math.min(minutes(start), minutes(OPEN_TO) - 15);
  return { startTime: hhmm(s), endTime: hhmm(Math.min(s + len, minutes(OPEN_TO))) };
}

export function slotChanged(r: Reservation, s: Slot): boolean {
  return r.roomUnitRef !== s.roomUnitRef || r.date !== s.date || r.startTime !== s.startTime || r.endTime !== s.endTime;
}

/** The reservation rebooked to `s` and approved by `by`. */
export function applyReschedule(r: Reservation, s: Slot, room: Room, by: string, now: string): Reservation {
  const original = r.original ?? {
    roomUnitRef: r.roomUnitRef, roomLabel: r.roomLabel, propertyCode: r.propertyCode, propertyName: r.propertyName,
    date: r.date, startTime: r.startTime, endTime: r.endTime,
  };
  return {
    ...r,
    roomUnitRef: room.unitRef, roomLabel: room.label, propertyCode: room.propertyCode, propertyName: room.propertyName,
    date: s.date, startTime: s.startTime, endTime: s.endTime,
    status: "Approved", decidedAt: now, decidedBy: by,
    original, modifiedAt: now, modifiedBy: by,
    updatedAt: now,
  };
}
