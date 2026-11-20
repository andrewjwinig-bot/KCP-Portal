// Commission entries are ONE stored list per page (office / retail), and the
// page used to POST the whole list back on every save, which the route stored
// as is. A page whose load had failed (it read as an empty list) then saved
// ONE entry over every commission on file, and two open tabs overwrote each
// other. The save is now a MERGE against what is stored:
//   - every entry the page sends is upserted by id;
//   - an entry is REMOVED only when the page had it (`baseIds`) and no longer
//     sends it — a deliberate delete;
//   - anything stored that the page never saw (added from another tab, by the
//     cron) is kept.
// Pure, so the rule is pinned by mergeEntries.test.ts.

export type HasId = { id: string };

export function mergeEntries<T extends HasId>(stored: T[], next: T[], baseIds: string[] | null): T[] {
  const sent = new Map(next.filter((e) => e && typeof e.id === "string" && e.id).map((e) => [e.id, e]));
  // No base (an old page): the page's list is taken as the whole truth, as before.
  if (!baseIds) return [...sent.values()];
  const removed = new Set(baseIds.filter((id) => !sent.has(id)));
  const out: T[] = [];
  const placed = new Set<string>();
  for (const e of stored) {
    if (removed.has(e.id)) continue;
    out.push(sent.get(e.id) ?? e);
    placed.add(e.id);
  }
  for (const [id, e] of sent) if (!placed.has(id)) out.push(e);
  return out;
}
