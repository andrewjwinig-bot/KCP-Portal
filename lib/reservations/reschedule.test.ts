import { describe, it, expect } from "vitest";
import { applyReschedule, dayBookings, moveTo, slotConflicts, slotError, QUARTER_HOURS } from "./reschedule";
import { BOOKABLE_ROOMS } from "./rooms";
import type { Reservation } from "./storage";

const base = (o: Partial<Reservation>): Reservation => ({
  id: "a", roomUnitRef: "4060-217", roomLabel: "Conference Room", propertyCode: "4060", propertyName: "Building 6",
  tenantCompany: "Acme", tenantResolved: true, contactFirstName: "Pat", contactLastName: "Lee", contactEmail: "p@x.test",
  contactPhone: "1", date: "2026-12-01", startTime: "10:00", endTime: "11:00", purpose: "", status: "Pending",
  decidedAt: null, decidedBy: null, notes: [], createdAt: "", updatedAt: "", ...o,
});

describe("modify & book", () => {
  it("applies the tenant form's rules", () => {
    expect(slotError({ date: "2026-12-01", startTime: "09:00", endTime: "10:30" })).toBeNull(); // Tuesday
    expect(slotError({ date: "2026-12-05", startTime: "09:00", endTime: "10:00" })).toMatch(/Monday through Friday/);
    expect(slotError({ date: "2026-12-01", startTime: "07:45", endTime: "09:00" })).toMatch(/8:00 AM/);
    expect(slotError({ date: "2026-12-01", startTime: "09:10", endTime: "10:00" })).toMatch(/15-minute/);
    expect(slotError({ date: "2026-12-01", startTime: "10:00", endTime: "10:00" })).toMatch(/after/);
    expect(QUARTER_HOURS[0]).toBe("08:00");
    expect(QUARTER_HOURS.at(-1)).toBe("18:00");
  });

  it("conflicts only with other APPROVED bookings in that room that day, never itself", () => {
    const all = [
      base({}),
      base({ id: "b", status: "Approved", startTime: "10:30", endTime: "12:00" }),
      base({ id: "c", status: "Pending", startTime: "10:00", endTime: "11:00" }),
      base({ id: "d", status: "Approved", roomUnitRef: "4080-201", startTime: "10:00", endTime: "11:00" }),
    ];
    const s = { roomUnitRef: "4060-217", date: "2026-12-01", startTime: "10:00", endTime: "11:00" };
    expect(slotConflicts(all, s, "a").map((r) => r.id)).toEqual(["b"]);
    expect(slotConflicts(all, { ...s, startTime: "12:00", endTime: "13:00" }, "a")).toEqual([]);
    expect(dayBookings(all, "4060-217", "2026-12-01", "a").map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("moving keeps the length, clamped to closing", () => {
    expect(moveTo("13:00", { startTime: "10:00", endTime: "11:30" })).toEqual({ startTime: "13:00", endTime: "14:30" });
    expect(moveTo("17:30", { startTime: "10:00", endTime: "12:00" })).toEqual({ startTime: "17:30", endTime: "18:00" });
  });

  it("rebooks, approves, and keeps the tenant's first request", () => {
    const room = BOOKABLE_ROOMS.find((r) => r.unitRef === "4080-201")!;
    const once = applyReschedule(base({}), { roomUnitRef: room.unitRef, date: "2026-12-02", startTime: "14:00", endTime: "15:00" }, room, "Nancy", "t1");
    expect(once).toMatchObject({ status: "Approved", decidedBy: "Nancy", roomUnitRef: "4080-201", propertyName: "Building 8", date: "2026-12-02", startTime: "14:00", modifiedBy: "Nancy" });
    expect(once.original).toMatchObject({ roomUnitRef: "4060-217", date: "2026-12-01", startTime: "10:00", endTime: "11:00" });
    const twice = applyReschedule(once, { roomUnitRef: room.unitRef, date: "2026-12-03", startTime: "09:00", endTime: "10:00" }, room, "Greg", "t2");
    expect(twice.original).toEqual(once.original);
    expect(twice.modifiedBy).toBe("Greg");
  });
});
