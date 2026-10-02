// Per-user personal to-do storage. Each user's todos live in their own scope
// (`todos/<userId>`), one blob per task, so concurrent edits never race and one
// user can never read another's list.

import "server-only";
import { scopedCollection } from "@/lib/collectionStore";
import type { Todo } from "./types";

const store = scopedCollection<Todo>({ prefix: "todos", keyOf: (t) => t.id });

/** The to-do collection for a single user. */
export function todosFor(userId: string) {
  return store.forScope(userId);
}
