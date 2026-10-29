import { describe, it, expect } from "vitest";
import { bucketTodos, openThisWeekCount, openBucketOf, endOfWeekISO, weekBounds, advanceDue, type Todo } from "./types";

// Fixed "now": Wednesday, July 15 2026 (local). Week = Mon Jul 13 … Sun Jul 19.
const NOW = new Date(2026, 6, 15, 10, 0, 0);

function todo(p: Partial<Todo>): Todo {
  return { id: p.id ?? "x", text: p.text ?? "t", due: p.due ?? null, done: p.done ?? false, priority: p.priority, repeat: p.repeat, createdAt: p.createdAt ?? "2026-07-10T00:00:00.000Z", note: p.note, completedAt: p.completedAt ?? null };
}

describe("todo bucketing", () => {
  it("week bounds are Monday..Sunday containing now", () => {
    const { monday, sunday } = weekBounds(NOW);
    expect(monday.getDate()).toBe(13);
    expect(sunday.getDate()).toBe(19);
    expect(endOfWeekISO(NOW)).toBe("2026-07-19");
  });

  it("classifies open todos by due date", () => {
    expect(openBucketOf(todo({ due: "2026-07-10" }), NOW)).toBe("overdue"); // last week
    expect(openBucketOf(todo({ due: "2026-07-15" }), NOW)).toBe("thisWeek"); // today
    expect(openBucketOf(todo({ due: "2026-07-19" }), NOW)).toBe("thisWeek"); // Sunday
    expect(openBucketOf(todo({ due: "2026-07-20" }), NOW)).toBe("later"); // next Monday
    expect(openBucketOf(todo({ due: null }), NOW)).toBe("someday");
  });

  it("done todos land in done regardless of date", () => {
    const b = bucketTodos([todo({ id: "a", due: "2026-07-01", done: true })], NOW);
    expect(b.done).toHaveLength(1);
    expect(b.overdue).toHaveLength(0);
  });

  it("groups and counts open-this-week (overdue + this week)", () => {
    const todos = [
      todo({ id: "1", due: "2026-07-10" }),           // overdue
      todo({ id: "2", due: "2026-07-16" }),           // this week
      todo({ id: "3", due: "2026-08-01" }),           // later
      todo({ id: "4", due: null }),                    // someday
      todo({ id: "5", due: "2026-07-14", done: true }),// done
    ];
    const b = bucketTodos(todos, NOW);
    expect(b.overdue.map((t) => t.id)).toEqual(["1"]);
    expect(b.thisWeek.map((t) => t.id)).toEqual(["2"]);
    expect(b.later.map((t) => t.id)).toEqual(["3"]);
    expect(b.someday.map((t) => t.id)).toEqual(["4"]);
    expect(b.done.map((t) => t.id)).toEqual(["5"]);
    expect(openThisWeekCount(todos, NOW)).toBe(2);
  });

  it("sorts this-week by due date ascending", () => {
    const todos = [
      todo({ id: "late", due: "2026-07-18" }),
      todo({ id: "early", due: "2026-07-15" }),
    ];
    expect(bucketTodos(todos, NOW).thisWeek.map((t) => t.id)).toEqual(["early", "late"]);
  });

  it("sorts high importance to the top within a bucket (over due date)", () => {
    const todos = [
      todo({ id: "normal-early", due: "2026-07-15", priority: "normal" }),
      todo({ id: "high-late", due: "2026-07-18", priority: "high" }),
      todo({ id: "low-mid", due: "2026-07-16", priority: "low" }),
    ];
    expect(bucketTodos(todos, NOW).thisWeek.map((t) => t.id)).toEqual(["high-late", "normal-early", "low-mid"]);
  });
});

describe("recurrence — advanceDue", () => {
  it("advances by the interval from the task's due date", () => {
    expect(advanceDue("2026-07-15", "daily", NOW)).toBe("2026-07-16");
    expect(advanceDue("2026-07-15", "weekly", NOW)).toBe("2026-07-22");
    expect(advanceDue("2026-07-15", "monthly", NOW)).toBe("2026-08-15");
    expect(advanceDue("2026-07-15", "quarterly", NOW)).toBe("2026-10-15");
    expect(advanceDue("2026-07-15", "yearly", NOW)).toBe("2027-07-15");
  });
  it("rolls month/year boundaries", () => {
    expect(advanceDue("2026-12-20", "monthly", NOW)).toBe("2027-01-20");
    expect(advanceDue("2026-11-15", "quarterly", NOW)).toBe("2027-02-15");
  });
  it("advances from today when the task has no due date", () => {
    expect(advanceDue(null, "weekly", NOW)).toBe("2026-07-22"); // NOW = Wed Jul 15
  });
  it("non-repeating returns the original date (or today)", () => {
    expect(advanceDue("2026-07-15", "none", NOW)).toBe("2026-07-15");
    expect(advanceDue(null, "none", NOW)).toBe("2026-07-15");
  });
});
