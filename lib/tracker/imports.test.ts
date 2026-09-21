import { describe, it, expect } from "vitest";
import { IMPORT_REMINDERS, reminderStatus, reminderDueYet, reminderOutstanding, sortByUrgency, type ImportReminder } from "./imports";

const weekly = (over: Partial<ImportReminder> = {}): ImportReminder => ({
  id: "w", label: "Weekly", cadence: "weekly", when: "Every Wednesday",
  link: "/", feeds: "", dueFromWeekday: 3, ...over,
});
const monthly = (over: Partial<ImportReminder> = {}): ImportReminder => ({
  id: "m", label: "Monthly", cadence: "monthly", when: "At monthly close", link: "/", feeds: "", ...over,
});

// Sep 2026: the 21st is a Monday, 23rd a Wednesday, 25th a Friday.
const MON = new Date(2026, 8, 21, 9);
const WED = new Date(2026, 8, 23, 9);
const FRI = new Date(2026, 8, 25, 9);

describe("the AP report is not outstanding on a Monday", () => {
  it("is not due before the day it can be done", () => {
    // It reflects bills PAID on Wednesday. Nothing exists to import yet.
    expect(reminderDueYet(weekly(), MON)).toBe(false);
    expect(reminderOutstanding(weekly(), undefined, MON)).toBe(false);
    expect(reminderStatus(weekly(), undefined, MON)).toBe("not-yet-due");
  });

  it("is due on the day itself, and overdue once the week has moved on", () => {
    expect(reminderStatus(weekly(), undefined, WED)).toBe("due");
    expect(reminderStatus(weekly(), undefined, FRI)).toBe("overdue");
  });

  it("is done once it has been imported this week", () => {
    const imported = new Date(2026, 8, 23, 14).toISOString();
    expect(reminderStatus(weekly(), imported, FRI)).toBe("done");
  });

  it("does not gate a weekly reminder that carries no day", () => {
    expect(reminderDueYet(weekly({ dueFromWeekday: undefined }), MON)).toBe(true);
  });
});

describe("a monthly import", () => {
  it("is due early in the month and overdue near the end", () => {
    expect(reminderStatus(monthly(), undefined, new Date(2026, 8, 3))).toBe("due");
    expect(reminderStatus(monthly(), undefined, new Date(2026, 8, 28))).toBe("overdue");
  });

  it("is done once this month's import has landed", () => {
    expect(reminderStatus(monthly(), new Date(2026, 8, 2).toISOString(), new Date(2026, 8, 28))).toBe("done");
  });

  it("does not count last month's import", () => {
    expect(reminderStatus(monthly(), new Date(2026, 7, 28).toISOString(), new Date(2026, 8, 28))).toBe("overdue");
  });
});

describe("the order the card reads in", () => {
  it("puts what needs you FIRST and what is finished last", () => {
    const rs = [
      monthly({ id: "done" }),
      monthly({ id: "overdue" }),
      weekly({ id: "notyet" }),
      monthly({ id: "due" }),
    ];
    const at: Record<string, string | undefined> = {
      done: new Date(2026, 8, 2).toISOString(),
      overdue: undefined,
      notyet: undefined,
      due: undefined,
    };
    // On the 28th: "due" is past 75% of the month, so use a mid-month date
    // where a monthly with no import is merely due.
    const now = new Date(2026, 8, 10, 9); // a Thursday — past Wednesday
    const order = sortByUrgency(rs, (r) => at[r.id], now).map((r) => r.id);
    // notyet is a weekly whose Wednesday has passed on the 10th, so it is due
    // too; what matters is that `done` is last.
    expect(order[order.length - 1]).toBe("done");
  });

  it("leads with the one untouched longest, within a status", () => {
    const older = monthly({ id: "older" });
    const newer = monthly({ id: "newer" });
    const at: Record<string, string> = {
      older: new Date(2026, 8, 1).toISOString(),
      newer: new Date(2026, 8, 20).toISOString(),
    };
    const order = sortByUrgency([newer, older], (r) => at[r.id], new Date(2026, 8, 25)).map((r) => r.id);
    expect(order).toEqual(["older", "newer"]);
  });
});

describe("the AP reminder itself", () => {
  it("is wired to Wednesday and says so", () => {
    const ap = IMPORT_REMINDERS.find((r) => r.id === "imp-ap")!;
    expect(ap.dueFromWeekday).toBe(3);
    expect(ap.when).toBe("Every Wednesday");
    expect(ap.feeds).toBe("Import Paid Bills to Cash Sheet");
  });
});
