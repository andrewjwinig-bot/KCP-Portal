// Personal to-do list — a private, per-user task list separate from the shared
// recurring Task Tracker. Each user only ever sees their own todos.
//
// This module is pure (no server-only imports) so the bucketing helpers can run
// on both the client (page + sidebar badge) and the server.

/** Importance. Sorts high → normal → low within each bucket. */
export type Priority = "low" | "normal" | "high";
export const PRIORITIES: Priority[] = ["high", "normal", "low"];

/** Recurrence. When a repeating task is completed, the next occurrence is spawned. */
export type Repeat = "none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export const REPEATS: Repeat[] = ["none", "daily", "weekly", "monthly", "quarterly", "yearly"];
export const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};

export type Todo = {
  id: string;
  /** The task text, e.g. "Send Nancy the Q2 CAM figures". */
  text: string;
  /** Optional free-text note (who asked, context). */
  note?: string;
  /** Due date as a local calendar day "YYYY-MM-DD", or null for no date. */
  due: string | null;
  done: boolean;
  /** Importance — defaults to "normal" when absent. */
  priority?: Priority;
  /** Recurrence — defaults to "none" when absent. */
  repeat?: Repeat;
  /** ISO timestamp the todo was created. */
  createdAt: string;
  /** ISO timestamp it was checked off, when done. */
  completedAt?: string | null;
};

export function priorityOf(t: Todo): Priority {
  return t.priority ?? "normal";
}
function priorityRank(p: Priority): number {
  return p === "high" ? 0 : p === "normal" ? 1 : 2;
}

export type OpenBucket = "overdue" | "thisWeek" | "later" | "someday";

export type BucketedTodos = {
  overdue: Todo[];
  thisWeek: Todo[];
  later: Todo[];
  someday: Todo[];
  done: Todo[];
};

/** Parse a "YYYY-MM-DD" day into a local-midnight Date, or null. */
export function parseDueDate(due: string | null | undefined): Date | null {
  if (!due) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Local-midnight Date for the calendar day containing `now`. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Monday (00:00) and Sunday (23:59:59.999) of the ISO week containing `now`. */
export function weekBounds(now: Date): { monday: Date; sunday: Date } {
  const today = startOfDay(now);
  const offset = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
  return { monday, sunday };
}

/** Which open-bucket a not-yet-done todo falls into, relative to `now`. */
export function openBucketOf(todo: Todo, now: Date): OpenBucket {
  const due = parseDueDate(todo.due);
  if (!due) return "someday";
  const today = startOfDay(now);
  if (due < today) return "overdue";
  const { sunday } = weekBounds(now);
  return due <= sunday ? "thisWeek" : "later";
}

/** Local calendar day → "YYYY-MM-DD". */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** ISO day string for the end of this week (Sunday) — used by the "This week"
 *  quick-add so a new task lands in the current week. */
export function endOfWeekISO(now: Date): string {
  return toISODate(weekBounds(now).sunday);
}

/** The next due date for a repeating task after it's completed. Advances from
 *  the task's due date (or today when it has none) by one recurrence interval. */
export function advanceDue(dueISO: string | null, repeat: Repeat, now: Date): string {
  const base = parseDueDate(dueISO) ?? startOfDay(now);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  switch (repeat) {
    case "daily":     d.setDate(d.getDate() + 1); break;
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
    default:          return dueISO ?? toISODate(startOfDay(now));
  }
  return toISODate(d);
}

// Sort open todos: importance first (high → low), then dated ascending, undated
// last, then newest-created first.
function byPriorityThenDue(a: Todo, b: Todo): number {
  const pr = priorityRank(priorityOf(a)) - priorityRank(priorityOf(b));
  if (pr !== 0) return pr;
  if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : b.createdAt.localeCompare(a.createdAt);
  if (a.due) return -1;
  if (b.due) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** Group todos into overdue / this-week / later / someday / done buckets. */
export function bucketTodos(todos: Todo[], now: Date): BucketedTodos {
  const out: BucketedTodos = { overdue: [], thisWeek: [], later: [], someday: [], done: [] };
  for (const t of todos) {
    if (t.done) { out.done.push(t); continue; }
    out[openBucketOf(t, now)].push(t);
  }
  out.overdue.sort(byPriorityThenDue);
  out.thisWeek.sort(byPriorityThenDue);
  out.later.sort(byPriorityThenDue);
  out.someday.sort(byPriorityThenDue);
  // Done: most-recently completed first.
  out.done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return out;
}

/** Count of open tasks that need attention this week (overdue + due this week). */
export function openThisWeekCount(todos: Todo[], now: Date): number {
  let n = 0;
  for (const t of todos) {
    if (t.done) continue;
    const b = openBucketOf(t, now);
    if (b === "overdue" || b === "thisWeek") n++;
  }
  return n;
}
