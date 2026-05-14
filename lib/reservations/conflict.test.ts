import { describe, expect, it } from "vitest";
import { findConflicts, timesOverlap } from "./conflict";
import type { Reservation } from "./storage";

function r(partial: Partial<Reservation>): Reservation {
  return {
    id: partial.id ?? "rsv_1",
    roomUnitRef: partial.roomUnitRef ?? "4060-217",
    roomLabel: "Conference Room",
    propertyCode: "4060",
    propertyName: "Building 6",
    tenantCompany: partial.tenantCompany ?? "Acme",
    contactFirstName: "A",
    contactLastName: "B",
    contactEmail: "a@b.co",
    contactPhone: "555",
    date: partial.date ?? "2026-06-01",
    startTime: partial.startTime ?? "10:00",
    endTime: partial.endTime ?? "11:00",
    purpose: "",
    status: partial.status ?? "Approved",
    decidedAt: null, decidedBy: null,
    notes: [],
    createdAt: "",
    updatedAt: "",
  };
}

describe("timesOverlap", () => {
  it("detects strict overlap", () => {
    expect(timesOverlap("10:00", "11:00", "10:30", "11:30")).toBe(true);
    expect(timesOverlap("10:00", "11:00", "09:30", "10:30")).toBe(true);
    expect(timesOverlap("10:00", "11:00", "10:15", "10:45")).toBe(true);
  });

  it("treats touching edges as non-overlap (back-to-back bookings ok)", () => {
    expect(timesOverlap("10:00", "11:00", "11:00", "12:00")).toBe(false);
    expect(timesOverlap("10:00", "11:00", "09:00", "10:00")).toBe(false);
  });

  it("returns false for disjoint ranges", () => {
    expect(timesOverlap("10:00", "11:00", "13:00", "14:00")).toBe(false);
  });
});

describe("findConflicts", () => {
  const approved = r({ id: "rsv_a", status: "Approved", startTime: "10:00", endTime: "11:00" });
  const pending = r({ id: "rsv_p", status: "Pending",  startTime: "10:00", endTime: "11:00" });
  const declined = r({ id: "rsv_d", status: "Declined", startTime: "10:00", endTime: "11:00" });

  it("only matches Approved reservations", () => {
    expect(findConflicts([pending, declined], "4060-217", "2026-06-01", "10:00", "11:00")).toEqual([]);
    expect(findConflicts([approved], "4060-217", "2026-06-01", "10:15", "10:45")).toHaveLength(1);
  });

  it("ignores other rooms and other dates", () => {
    expect(findConflicts([approved], "4080-201", "2026-06-01", "10:00", "11:00")).toEqual([]);
    expect(findConflicts([approved], "4060-217", "2026-06-02", "10:00", "11:00")).toEqual([]);
  });

  it("returns the conflicting slot info", () => {
    const conflicts = findConflicts(
      [r({ status: "Approved", tenantCompany: "Acme Corp", startTime: "09:30", endTime: "10:30" })],
      "4060-217", "2026-06-01", "10:00", "11:00",
    );
    expect(conflicts).toEqual([{ startTime: "09:30", endTime: "10:30", tenantCompany: "Acme Corp" }]);
  });

  it("touching back-to-back bookings do not conflict", () => {
    expect(findConflicts([approved], "4060-217", "2026-06-01", "11:00", "12:00")).toEqual([]);
  });
});
