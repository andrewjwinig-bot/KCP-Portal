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
