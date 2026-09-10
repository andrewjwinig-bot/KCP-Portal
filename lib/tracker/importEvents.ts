// Server record of the last time each recurring source file was imported, so
// the weekly digest + dashboard can show import reminders as actually DONE or
// OUTSTANDING (not just static reminders). Keyed by the ImportReminder id in
// lib/tracker/imports.ts (e.g. "imp-rentroll", "imp-gl", "imp-ap").

import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import type { ImportEvent } from "./imports";

// reminderSatisfied + ImportEvent live in ./imports (client-safe); re-export the
// type so server callers can import both from here.
export type { ImportEvent } from "./imports";
export { reminderSatisfied } from "./imports";

const store = createMapStore<ImportEvent>({ prefix: "tracker-import-events" });

/** Record that a source file was just imported. Best-effort; callers shouldn't
 *  fail their upload if this throws. */
export async function recordImport(id: string, ev: ImportEvent): Promise<void> {
  await store.set(id, ev);
}

export async function getImportEvents(): Promise<Record<string, ImportEvent>> {
  return store.all();
}
