// Reservation overlap detection. Used by the submission endpoint to block
// new requests that step on an already-Approved booking.

import type { Reservation } from "./storage";

export type ConflictSlot = {
  startTime: string;
  endTime: string;
  tenantCompany: string;
};

/** Strict overlap on the time line: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅. */
export function timesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Returns any Approved reservations that overlap the proposed slot for the
 * given room on the given date. Pending or Declined reservations are
 * ignored — they might still get rejected or already were.
 */
export function findConflicts(
  reservations: Reservation[],
  roomUnitRef: string,
  date: string,
  startTime: string,
  endTime: string,
): ConflictSlot[] {
  return reservations
    .filter((r) => r.status === "Approved")
    .filter((r) => r.roomUnitRef === roomUnitRef)
    .filter((r) => r.date === date)
    .filter((r) => timesOverlap(startTime, endTime, r.startTime, r.endTime))
    .map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      tenantCompany: r.tenantCompany,
    }));
}

/** Tenants may reserve each conference room on at most this many days per month. */
export const MONTHLY_DAY_LIMIT = 2;

/**
 * Distinct dates a tenant already holds for one room in a given calendar
 * month (YYYY-MM). Declined reservations don't count; Pending and Approved
 * both do, so a tenant can't queue up extra days while requests are open.
 */
export function tenantRoomDaysInMonth(
  reservations: Reservation[],
  roomUnitRef: string,
  tenantCompany: string,
  yyyymm: string,
): Set<string> {
  const company = tenantCompany.trim().toLowerCase();
  const days = new Set<string>();
  for (const r of reservations) {
    if (r.status === "Declined") continue;
    if (r.roomUnitRef !== roomUnitRef) continue;
    if (r.tenantCompany.trim().toLowerCase() !== company) continue;
    if (r.date.slice(0, 7) !== yyyymm) continue;
    days.add(r.date);
  }
  return days;
}
