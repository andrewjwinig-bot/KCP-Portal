// Server-side task completions for the master tracker.
//
// The Tracker page checks tasks off in the browser's localStorage — private to
// one browser. This store records completions on the SERVER so a task finished
// by one person (e.g. Harry processing CC expenses) can auto-check off on
// everyone's list and in the weekly digest email. Keyed by
// `<year>-<monthIndex0>-<taskId>` to mirror the tracker's per-month buckets.

import { createMapStore } from "@/lib/collectionStore";

export type TaskCompletion = {
  /** ISO timestamp the task was marked complete. */
  at: string;
  /** Who/what completed it (e.g. "harry", or a source label). */
  by?: string;
  /** The trigger, when auto-completed (e.g. "credit-card", "allocated"). */
  source?: string;
};

const store = createMapStore<TaskCompletion>({ prefix: "tracker-completions" });

/** Stable key matching the tracker's `tracker-v2-<year>-<month0>` buckets. */
export function completionKey(year: number, month0: number, taskId: string): string {
  return `${year}-${month0}-${taskId}`;
}

/** All server-recorded completions, keyed by completionKey(). */
export async function getCompletions(): Promise<Record<string, TaskCompletion>> {
  return store.all();
}

/** Mark a task's month occurrence complete. Idempotent. */
export async function markTaskComplete(year: number, month0: number, taskId: string, c: TaskCompletion): Promise<void> {
  await store.set(completionKey(year, month0, taskId), c);
}

/** Clear a server completion (revert to per-browser tracker state). */
export async function clearTaskComplete(year: number, month0: number, taskId: string): Promise<void> {
  await store.remove(completionKey(year, month0, taskId));
}
